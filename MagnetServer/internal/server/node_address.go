package server

import (
	"MagnetShared/netutil"
	protocol "MagnetShared/protocol"
)

func nodePublicIPv4(info protocol.NodeInfo, peer string) string {
	if address := netutil.PublicIPv4(info.Address); address != "" {
		return address
	}
	for _, capability := range info.Capabilities {
		if capability == "public-ipv4-v1" {
			// Updated Links explicitly report unknown when discovery fails.
			// Do not substitute a proxy's public IP in that case.
			return ""
		}
	}
	// Compatibility for older Links, respecting the existing trusted-proxy policy.
	return netutil.PublicIPv4(peer)
}
