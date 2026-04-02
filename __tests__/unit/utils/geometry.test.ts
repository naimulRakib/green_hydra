import { describe, it, expect } from 'vitest'

/**
 * Basic geometry calculations for pollution plume modeling
 * These functions are used throughout the industrial pollution system
 */

/**
 * Haversine distance formula - calculates distance between two GPS coordinates
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Calculate bearing from point1 to point2 in degrees (0-360)
 */
export function calculateBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const lat1Rad = (lat1 * Math.PI) / 180
  const lat2Rad = (lat2 * Math.PI) / 180

  const y = Math.sin(dLng) * Math.cos(lat2Rad)
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng)

  let bearing = (Math.atan2(y, x) * 180) / Math.PI
  return (bearing + 360) % 360
}

/**
 * Calculate angle difference (shortest path between two angles)
 */
export function angleDiff(angle1: number, angle2: number): number {
  let diff = Math.abs(angle1 - angle2)
  if (diff > 180) diff = 360 - diff
  return diff
}

describe('Geometry Utilities', () => {
  describe('calculateDistance', () => {
    it('should calculate Haversine distance correctly', () => {
      // Hazaribagh to Keraniganj (real locations in Dhaka)
      const distance = calculateDistance(23.7940, 90.4152, 23.8050, 90.4262)
      expect(distance).toBeCloseTo(1.63, 1) // ~1.6 km
    })

    it('should return 0 for same coordinates', () => {
      const distance = calculateDistance(23.8, 90.4, 23.8, 90.4)
      expect(distance).toBe(0)
    })

    it('should calculate longer distances accurately', () => {
      // Dhaka to Chittagong (approx 200km)
      const distance = calculateDistance(23.8103, 90.4125, 22.3569, 91.7832)
      expect(distance).toBeGreaterThan(190)
      expect(distance).toBeLessThan(220)
    })
  })

  describe('calculateBearing', () => {
    it('should calculate bearing to northeast (NE)', () => {
      const bearing = calculateBearing(23.7940, 90.4152, 23.8050, 90.4262)
      expect(bearing).toBeGreaterThan(30)
      expect(bearing).toBeLessThan(60)
    })

    it('should calculate bearing directly north', () => {
      const bearing = calculateBearing(23.0, 90.0, 24.0, 90.0)
      expect(bearing).toBeCloseTo(0, 1)
    })

    it('should calculate bearing approximately east', () => {
      const bearing = calculateBearing(23.0, 90.0, 23.0, 91.0)
      expect(bearing).toBeGreaterThan(89)
      expect(bearing).toBeLessThan(91)
    })

    it('should calculate bearing directly south', () => {
      const bearing = calculateBearing(24.0, 90.0, 23.0, 90.0)
      expect(bearing).toBeCloseTo(180, 1)
    })
  })

  describe('angleDiff', () => {
    it('should calculate small angle difference', () => {
      expect(angleDiff(45, 50)).toBe(5)
      expect(angleDiff(50, 45)).toBe(5)
    })

    it('should calculate angle difference across 0 degrees', () => {
      expect(angleDiff(350, 10)).toBe(20)
      expect(angleDiff(10, 350)).toBe(20)
    })

    it('should calculate 180 degree difference', () => {
      expect(angleDiff(0, 180)).toBe(180)
      expect(angleDiff(90, 270)).toBe(180)
    })

    it('should return same angle difference regardless of order', () => {
      const diff1 = angleDiff(30, 120)
      const diff2 = angleDiff(120, 30)
      expect(diff1).toBe(diff2)
    })
  })
})
