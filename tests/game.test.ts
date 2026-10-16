import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatTime, generateSecret, getFeedback, validateEntry } from '../src/lib/game'

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
    expect(validateEntry('number', '0011')).toBeNull()
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

    it('generates exactly four digits with leading zeros and repeats allowed', () => {
      randomValues([0, 1, 1, 2])
      const secret = generateSecret('number', [])
      expect(secret).toBe('0112')
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
      const random = randomValues([0xffffffff, 0, 0, 0, 0])
      expect(generateSecret('number', [])).toBe('0000')
      expect(random).toHaveBeenCalledTimes(5)
    })
  })
  it('rejects malformed entries without relying on a client dictionary', () => {
    expect(validateEntry('number', '123')).not.toBeNull()
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
