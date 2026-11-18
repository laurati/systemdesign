package ratelimit

import (
	"sync"
	"time"
)

// ---------------------------------------------------------------------------
// Fixed window counter
// ---------------------------------------------------------------------------

// FixedWindow conta requisições em janelas alinhadas (ex.: 12:00:00–12:00:59).
// Simples e barato (1 contador por chave), mas tem o problema da borda:
// `limit` requisições no fim de uma janela + `limit` no início da próxima
// = 2×limit dentro de um intervalo de `window`.
type FixedWindow struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	now      Clock
	counters map[string]*fwCounter
}

type fwCounter struct {
	windowStart time.Time
	count       int
}

func NewFixedWindow(limit int, window time.Duration, now Clock) *FixedWindow {
	if now == nil {
		now = time.Now
	}
	return &FixedWindow{limit: limit, window: window, now: now, counters: map[string]*fwCounter{}}
}

func (fw *FixedWindow) Allow(key string) bool {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	now := fw.now()
	start := now.Truncate(fw.window) // início da janela atual
	c, ok := fw.counters[key]
	if !ok || !c.windowStart.Equal(start) {
		c = &fwCounter{windowStart: start}
		fw.counters[key] = c
	}
	if c.count < fw.limit {
		c.count++
		return true
	}
	return false
}

// ---------------------------------------------------------------------------
// Sliding window log
// ---------------------------------------------------------------------------

// SlidingWindowLog guarda o timestamp de cada requisição aceita (em Redis seria
// um sorted set). Preciso — nunca passa do limite em nenhuma janela móvel —
// porém consome memória O(limit) por chave.
type SlidingWindowLog struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	now    Clock
	logs   map[string][]time.Time
}

func NewSlidingWindowLog(limit int, window time.Duration, now Clock) *SlidingWindowLog {
	if now == nil {
		now = time.Now
	}
	return &SlidingWindowLog{limit: limit, window: window, now: now, logs: map[string][]time.Time{}}
}

func (sl *SlidingWindowLog) Allow(key string) bool {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	now := sl.now()
	cutoff := now.Add(-sl.window)
	log := sl.logs[key]

	// Remove timestamps fora da janela (ZREMRANGEBYSCORE no Redis).
	i := 0
	for i < len(log) && !log[i].After(cutoff) {
		i++
	}
	log = log[i:]

	if len(log) < sl.limit {
		sl.logs[key] = append(log, now)
		return true
	}
	sl.logs[key] = log
	return false
}

// ---------------------------------------------------------------------------
// Sliding window counter
// ---------------------------------------------------------------------------

// SlidingWindowCounter é o meio-termo: guarda só 2 contadores (janela atual e
// anterior) e estima a contagem da janela móvel por média ponderada:
//
//	estimativa = atual + anterior × (fração da janela anterior ainda coberta)
//
// Memória O(1) por chave; erro pequeno (assume tráfego uniforme na janela anterior).
type SlidingWindowCounter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	now    Clock
	state  map[string]*swState
}

type swState struct {
	currStart time.Time
	curr      int
	prev      int
}

func NewSlidingWindowCounter(limit int, window time.Duration, now Clock) *SlidingWindowCounter {
	if now == nil {
		now = time.Now
	}
	return &SlidingWindowCounter{limit: limit, window: window, now: now, state: map[string]*swState{}}
}

func (sc *SlidingWindowCounter) Allow(key string) bool {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	now := sc.now()
	start := now.Truncate(sc.window)
	s, ok := sc.state[key]
	switch {
	case !ok:
		s = &swState{currStart: start}
		sc.state[key] = s
	case start.Sub(s.currStart) == sc.window: // avançou exatamente uma janela
		s.prev, s.curr, s.currStart = s.curr, 0, start
	case start.Sub(s.currStart) > sc.window: // ficou mais de uma janela sem tráfego
		s.prev, s.curr, s.currStart = 0, 0, start
	}

	elapsed := now.Sub(s.currStart).Seconds() / sc.window.Seconds()
	estimate := float64(s.curr) + float64(s.prev)*(1-elapsed)
	if estimate+1 <= float64(sc.limit) {
		s.curr++
		return true
	}
	return false
}
