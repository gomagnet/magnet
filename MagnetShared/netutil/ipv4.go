// Package netutil contains shared network-address validation, independent of
// Link transport authentication and the wire protocol.
package netutil

import (
	"net/netip"
	"strings"
)

// Globally reachable exceptions inside the protocol-assignment range.
var publicProtocolAnycast = [2]netip.Addr{netip.MustParseAddr("192.0.0.9"), netip.MustParseAddr("192.0.0.10")}

// Non-public special-purpose ranges from the IANA registry.
// https://www.iana.org/assignments/iana-ipv4-special-registry
var nonPublicIPv4 = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("192.88.99.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
}

// PublicIPv4 returns a canonical IPv4 literal, or empty for private, special,
// malformed or pure IPv6 addresses. This is presentation validation, never proof of
// ownership, reachability or authorization.
func PublicIPv4(value string) string {
	address, err := netip.ParseAddr(strings.TrimSpace(value))
	if err != nil {
		return ""
	}
	address = address.Unmap()
	if !address.Is4() || !address.IsGlobalUnicast() || address.IsPrivate() {
		return ""
	}
	if address == publicProtocolAnycast[0] || address == publicProtocolAnycast[1] {
		return address.String()
	}
	for _, prefix := range nonPublicIPv4 {
		if prefix.Contains(address) {
			return ""
		}
	}
	return address.String()
}
