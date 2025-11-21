package main

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
)

// generateID generates a random hex ID
func generateID() string {
	bytes := make([]byte, 16)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// generateKey generates a random hex key for authentication
func generateKey() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// splitAndTrim splits a string by separator and trims whitespace and quotes
func splitAndTrim(s string, sep string) []string {
	// Remove leading and trailing quotes from the entire string
	s = strings.Trim(s, "\"'")

	parts := strings.Split(s, sep)
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		// Trim whitespace and quotes from each part
		trimmed := strings.TrimSpace(part)
		trimmed = strings.Trim(trimmed, "\"'")
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}
