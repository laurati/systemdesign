// Package crawler implementa o "URL frontier" de um web crawler:
// a estrutura que decide QUAL URL baixar a seguir respeitando
//
//   - prioridade (páginas importantes primeiro — front queues);
//   - politeness (no máximo 1 requisição por host a cada `delay` — back queues);
//   - deduplicação (não baixar a mesma URL duas vezes).
package crawler

import (
	"container/heap"
	"net/url"
	"sync"
	"time"
)

type Frontier struct {
	mu      sync.Mutex
	delay   time.Duration
	now     func() time.Time
	seen    map[string]bool     // em produção: Bloom filter ou store de hashes
	perHost map[string][]queued // back queue por host (FIFO por prioridade)
	ready   hostHeap            // min-heap: próximo instante em que cada host pode ser visitado
	inHeap  map[string]bool
}

type queued struct {
	url      string
	priority int // maior = mais importante (PageRank, frequência de atualização…)
}

func NewFrontier(delay time.Duration, now func() time.Time) *Frontier {
	if now == nil {
		now = time.Now
	}
	return &Frontier{delay: delay, now: now, seen: map[string]bool{}, perHost: map[string][]queued{}, inHeap: map[string]bool{}}
}

// Add normaliza e enfileira a URL se ainda não foi vista.
func (f *Frontier) Add(raw string, priority int) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	u.Fragment = "" // #secao aponta para a mesma página
	norm := u.String()

	f.mu.Lock()
	defer f.mu.Unlock()
	if f.seen[norm] {
		return false
	}
	f.seen[norm] = true

	q := append(f.perHost[u.Host], queued{norm, priority})
	// Inserção ordenada por prioridade dentro do host (estável).
	for i := len(q) - 1; i > 0 && q[i].priority > q[i-1].priority; i-- {
		q[i], q[i-1] = q[i-1], q[i]
	}
	f.perHost[u.Host] = q
	if !f.inHeap[u.Host] {
		heap.Push(&f.ready, hostSlot{host: u.Host, at: f.now()})
		f.inHeap[u.Host] = true
	}
	return true
}

// Next devolve a próxima URL que pode ser baixada agora, ou "" se nenhum
// host está liberado (o worker deve esperar).
func (f *Frontier) Next() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.ready.Len() == 0 || f.ready[0].at.After(f.now()) {
		return ""
	}
	slot := heap.Pop(&f.ready).(hostSlot)
	q := f.perHost[slot.host]
	next := q[0]
	f.perHost[slot.host] = q[1:]
	if len(q) > 1 {
		heap.Push(&f.ready, hostSlot{host: slot.host, at: f.now().Add(f.delay)})
	} else {
		delete(f.inHeap, slot.host)
	}
	return next.url
}

type hostSlot struct {
	host string
	at   time.Time
}

type hostHeap []hostSlot

func (h hostHeap) Len() int           { return len(h) }
func (h hostHeap) Less(i, j int) bool { return h[i].at.Before(h[j].at) }
func (h hostHeap) Swap(i, j int)      { h[i], h[j] = h[j], h[i] }
func (h *hostHeap) Push(x any)        { *h = append(*h, x.(hostSlot)) }
func (h *hostHeap) Pop() any {
	old := *h
	x := old[len(old)-1]
	*h = old[:len(old)-1]
	return x
}
