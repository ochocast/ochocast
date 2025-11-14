package main

import (
	"crypto/rand"
	"encoding/hex"
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
