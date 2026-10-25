import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatTime, generateSecret, getFeedback, getKeyboardMarks, validateEntry, type Guess } from '../src/lib/game'

describe('duplicate-aware keyboard colours', () => {
  const history = (secret: string, values: string[]): Guess[] => values.map((guess, index) => ({
    id: String(index), guess, feedback: getFeedback(secret, guess), attempt: index + 1, elapsed_ms: 0,
  }))

  it('keeps a repeated digit yellow until all known green positions have been found across guesses', () => {
    const secret = '009056'
    expect(getKeyboardMarks(history(secret, ['000999']))['0']).toBe('present')
    expect(getKeyboardMarks(history(secret, ['000999', '999000']))['0']).toBe('hit')
    expect(getKeyboardMarks(history(secret, ['000999', '999000', '888888']))['0']).toBe('hit')
    expect(getKeyboardMarks(history(secret, ['000999']))['9']).toBe('present')
    expect(getKeyboardMarks(history(secret, ['000999', '999000']))['9']).toBe('hit')
  })

  it('does not double-count the same green position or treat extra grey copies as unresolved', () => {
    expect(getKeyboardMarks(history('009056', ['000999', '000999']))['0']).toBe('present')
    expect(getKeyboardMarks(history('334456', ['333333']))['3']).toBe('hit')
  })

  it('handles letters identically and can reveal another unresolved copy in a later guess', () => {
    expect(getKeyboardMarks(history('SECRET', ['STREET']))).toMatchObject({ E: 'present', T: 'hit', R: 'present' })
    expect(getKeyboardMarks(history('SECRET', ['STREET', 'LETTER']))['E']).toBe('hit')
    expect(getKeyboardMarks(history('009056', ['012345']))['0']).toBe('hit')
    expect(getKeyboardMarks(history('009056', ['012345', '000999']))['0']).toBe('present')
  })

  it('uses only published clues, leaves unseen keys unmarked, and never changes history tiles', () => {
    const guesses = history('009056', ['000999'])
    const before = structuredClone(guesses)
    expect(getKeyboardMarks(guesses)['8']).toBeUndefined()
    expect(getKeyboardMarks(history('009056', ['888888']))['8']).toBe('miss')
    expect(getKeyboardMarks([])).toEqual({})
    expect(guesses).toEqual(before)
    expect(guesses[0].feedback).toEqual(['hit', 'hit', 'present', 'present', 'miss', 'miss'])
  })
})

describe('automatic clue colours', () => {
  it('reserves exact copies before assigning yellow clues left to right', () => {
    expect(getFeedback('SECRET', 'STREET')).toEqual(['hit', 'miss', 'present', 'present', 'hit', 'hit'])
    expect(getFeedback('1123', '0111')).toEqual(['miss', 'hit', 'present', 'miss'])
  })
  it('leaves entirely absent items grey and colours every exact match green', () => {
    expect(getFeedback('0011', '2222')).toEqual(['miss', 'miss', 'miss', 'miss'])
    expect(getFeedback('LETTER', 'LETTER')).toEqual(['hit', 'hit', 'hit', 'hit', 'hit', 'hit'])
  })
  it.each([['', ''], ['1234', '123'], ['TREE', 'LETTER']])('rejects invalid lengths for %s / %s', (secret, guess) => {
    expect(() => getFeedback(secret, guess)).toThrow('same nonzero length')
  })
})

describe('client validation', () => {
  it('accepts duplicates and leading zeros', () => {
    expect(validateEntry('number', '001156')).toBeNull()
    expect(validateEntry('word', 'LETTER')).toBeNull()
    expect(validateEntry('word', 'NORMAL')).toBeNull()
  })

  describe('random private secrets', () => {
    afterEach(() => vi.unstubAllGlobals())

    function randomValues(values: number[]) {
      let index = 0
      const getRandomValues = vi.fn((bytes: Uint32Array) => {
        bytes[0] = values[index++]
        return bytes
      })
      vi.stubGlobal('crypto', { getRandomValues })
      return getRandomValues
    }

    it('generates exactly six digits with leading zeros and repeats allowed', () => {
      randomValues([0, 1, 1, 2, 5, 6])
      const secret = generateSecret('number', [])
      expect(secret).toBe('011256')
      expect(validateEntry('number', secret)).toBeNull()
    })

    it('selects a valid word from the loaded word bank', () => {
      randomValues([1])
      const words = ['SECRET', 'LETTER', 'STREET']
      const secret = generateSecret('word', words)
      expect(secret).toBe('LETTER')
      expect(validateEntry('word', secret)).toBeNull()
    })

    it('does not silently invent a word when the bank is unavailable', () => {
      expect(() => generateSecret('word', [])).toThrow('The dictionary is not ready yet.')
    })

    it('rejects out-of-range random samples instead of biasing selection', () => {
      const random = randomValues([0xffffffff, 0, 0, 0, 0, 0, 0])
      expect(generateSecret('number', [])).toBe('000000')
      expect(random).toHaveBeenCalledTimes(7)
    })
  })
  it('rejects malformed entries without relying on a client dictionary', () => {
    expect(validateEntry('number', '123')).not.toBeNull()
    expect(validateEntry('number', '1234')).toBe('Enter exactly 6 digits.')
    expect(validateEntry('number', '12345')).not.toBeNull()
    expect(validateEntry('number', '1234567')).not.toBeNull()
    expect(validateEntry('number', '12345A')).not.toBeNull()
    expect(validateEntry('number', '000000')).toBeNull()
    expect(validateEntry('number', '12AB')).not.toBeNull()
    expect(validateEntry('word', 'TREE')).not.toBeNull()
    expect(validateEntry('word', 'APPLE')).not.toBeNull()
    expect(validateEntry('word', 'APPLES')).toBeNull()
  })
  it('formats and clamps round timers', () => {
    expect(formatTime(300)).toBe('05:00')
    expect(formatTime(-5)).toBe('00:00')
    expect(formatTime(68.9)).toBe('01:08')
    expect(formatTime(90061)).toBe('25:01:01')
  })
})
