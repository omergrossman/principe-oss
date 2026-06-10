import { describe, it, expect } from "vitest";
import { isPrivateOrReservedIp } from "@/lib/sources/fetch";

// Regression tests for the SSRF guard. The hex-mapped cases are the bypass
// that the original regex guard missed (could SSRF to the cloud metadata IP).
describe("isPrivateOrReservedIp — blocks non-public addresses", () => {
  const blocked: Array<[string, string]> = [
    ["::ffff:a9fe:a9fe", "metadata IP, hex IPv4-mapped (the original bypass)"],
    ["::ffff:169.254.169.254", "metadata IP, dotted IPv4-mapped"],
    ["::ffff:7f00:1", "loopback, hex IPv4-mapped"],
    ["169.254.169.254", "cloud metadata IP"],
    ["127.0.0.1", "loopback"],
    ["10.1.2.3", "RFC1918 10/8"],
    ["192.168.1.1", "RFC1918 192.168/16"],
    ["172.16.5.5", "RFC1918 172.16/12"],
    ["100.64.0.1", "CGNAT"],
    ["0.0.0.0", "unspecified"],
    ["::1", "IPv6 loopback"],
    ["fe80::1", "IPv6 link-local"],
    ["fc00::1", "IPv6 unique-local"],
    ["64:ff9b::a9fe:a9fe", "NAT64 → metadata"],
  ];
  for (const [ip, label] of blocked) {
    it(`blocks ${ip} — ${label}`, () => {
      expect(isPrivateOrReservedIp(ip)).toBe(true);
    });
  }
});

describe("isPrivateOrReservedIp — allows public addresses", () => {
  const allowed: Array<[string, string]> = [
    ["8.8.8.8", "public IPv4"],
    ["1.1.1.1", "public IPv4"],
    ["2606:4700:4700::1111", "public IPv6"],
    ["::ffff:8.8.8.8", "public IPv4, mapped"],
  ];
  for (const [ip, label] of allowed) {
    it(`allows ${ip} — ${label}`, () => {
      expect(isPrivateOrReservedIp(ip)).toBe(false);
    });
  }
});
