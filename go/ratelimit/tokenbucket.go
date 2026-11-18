package ratelimit

import (
	"sync"
	"time"
)

// TokenBucket: cada chave tem um balde com capacidade `capacity`.
// Tokens são repostos continuamente a `refillPerSec` tokens/segundo.
// Cada requisição consome 1 token; sem token, a requisição é rejeitada.
//
// Permite rajadas (burst) de até `capacity` requisições — é o algoritmo
// usado por Amazon API Gateway e Stripe.
type TokenBucket struct {
	mu           sync.Mutex
	capacity     float64
	refillPerSec float64
	now          Clock
	buckets      map[string]*bucket
}

type bucket struct {
	tokens   float64
	lastSeen time.Time
}

func NewTokenBucket(capacity int, refillPerSec float64, now Clock) *TokenBucket {
	if now == nil {
		now = time.Now
	}
	return &TokenBucket{
		capacity:     float64(capacity),
		refillPerSec: refillPerSec,
		now:          now,
		buckets:      make(map[string]*bucket),
	}
}

func (tb *TokenBucket) Allow(key string) bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	now := tb.now()
	b, ok := tb.buckets[key]
	if !ok {
		// Balde novo começa cheio.
		b = &bucket{tokens: tb.capacity, lastSeen: now}
		tb.buckets[key] = b
	}

	// Refill "preguiçoso": em vez de um timer por balde, calculamos
	// quantos tokens teriam entrado desde a última visita.
	elapsed := now.Sub(b.lastSeen).Seconds()
	b.tokens = min(tb.capacity, b.tokens+elapsed*tb.refillPerSec)
	b.lastSeen = now

	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}
