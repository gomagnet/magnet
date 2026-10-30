package server

import protocol "MagnetShared/protocol"

// Historical charts store aggregate counters; core and process samples are live only.
func historyMetricsJSON(metrics protocol.Metrics) string {
	metrics.CPUCores = nil
	metrics.Processes = nil
	return marshal(metrics)
}
