import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatTime, generateSecret, validateEntry } from '../src/lib/game'

describe('client validation', () => {
  it('accepts duplicates and leading zeros', () => {
    expect(validateEntry('number', '0011', [])).toBeNull()
    expect(validateEntry('word', 'TREE', ['TREE'])).toBeNull()
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
      expect(validateEntry('number', secret, [])).toBeNull()
    })

    it('selects a valid word from the loaded word bank', () => {
      randomValues([1])
      const words = ['MINT', 'TREE', 'TIME']
      const secret = generateSecret('word', words)
      expect(secret).toBe('TREE')
      expect(validateEntry('word', secret, words)).toBeNull()
    })

    it('does not silently invent a word when the bank is unavailable', () => {
      expect(() => generateSecret('word', [])).toThrow('The word bank is not ready yet.')
    })

    it('rejects out-of-range random samples instead of biasing selection', () => {
      const random = randomValues([0xffffffff, 0, 0, 0, 0])
      expect(generateSecret('number', [])).toBe('0000')
      expect(random).toHaveBeenCalledTimes(5)
    })
  })
  it('rejects malformed and non-dictionary entries', () => {
    expect(validateEntry('number', '123', [])).not.toBeNull()
    expect(validateEntry('number', '12AB', [])).not.toBeNull()
    expect(validateEntry('word', 'ABCD', ['TREE'])).not.toBeNull()
    expect(validateEntry('word', 'APPLE', ['TREE'])).not.toBeNull()
  })
  it('formats and clamps round timers', () => {
    expect(formatTime(300)).toBe('05:00')
    expect(formatTime(-5)).toBe('00:00')
    expect(formatTime(68.9)).toBe('01:08')
    expect(formatTime(90061)).toBe('25:01:01')
  })
})
