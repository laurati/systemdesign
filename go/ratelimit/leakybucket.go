package ratelimit

import (
	"sync"
	"time"
)

// LeakyBucket (leaking bucket): requisições entram numa fila de tamanho fixo
// e "vazam" (são processadas) a uma taxa constante. Suaviza o tráfego:
// a saída é estável mesmo com entrada em rajadas. Usado pela Shopify.
//
// Aqui modelamos apenas a decisão de admissão: o "nível de água" cai
// `leakPerSec` por segundo; se a fila está cheia, rejeitamos.
type LeakyBucket struct {
	mu         sync.Mutex
	queueSize  float64
	leakPerSec float64
	now        Clock
	levels     map[string]*level
}

type level struct {
	water    float64
	lastLeak time.Time
}

func NewLeakyBucket(queueSize int, leakPerSec float64, now Clock) *LeakyBucket {
	if now == nil {
		now = time.Now
	}
	return &LeakyBucket{queueSize: float64(queueSize), leakPerSec: leakPerSec, now: now, levels: map[string]*level{}}
}

func (lb *LeakyBucket) Allow(key string) bool {
	lb.mu.Lock()
	defer lb.mu.Unlock()

	now := lb.now()
	l, ok := lb.levels[key]
	if !ok {
		l = &level{lastLeak: now}
		lb.levels[key] = l
	}
	leaked := now.Sub(l.lastLeak).Seconds() * lb.leakPerSec
	l.water = max(0, l.water-leaked)
	l.lastLeak = now

	if l.water+1 <= lb.queueSize {
		l.water++
		return true
	}
	return false
}
