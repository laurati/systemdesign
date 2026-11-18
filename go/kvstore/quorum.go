package kvstore

import (
	"errors"
	"sync"
)

// Versioned é um valor com seu vector clock.
type Versioned struct {
	Value string
	Clock VectorClock
}

// Replica simula um nó de armazenamento que pode estar fora do ar.
type Replica struct {
	Name string
	mu   sync.Mutex
	data map[string][]Versioned // pode guardar várias versões concorrentes (siblings)
	Down bool
}

func NewReplica(name string) *Replica { return &Replica{Name: name, data: map[string][]Versioned{}} }

func (r *Replica) put(key string, v Versioned) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Down {
		return false
	}
	// Descarta versões que a nova supera; mantém as concorrentes.
	var kept []Versioned
	for _, old := range r.data[key] {
		if Compare(old.Clock, v.Clock) == Concurrent {
			kept = append(kept, old)
		}
	}
	r.data[key] = append(kept, v)
	return true
}

func (r *Replica) get(key string) ([]Versioned, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.Down {
		return nil, false
	}
	return append([]Versioned(nil), r.data[key]...), true
}

// Cluster coordena leituras e escritas com quórum.
//
//	N = nº de réplicas da chave, W = acks para escrita, R = respostas para leitura.
//	W + R > N  → toda leitura enxerga pelo menos uma réplica com a última escrita.
//	R=1, W=N   → leitura rápida.   W=1, R=N → escrita rápida.
type Cluster struct {
	Replicas []*Replica
	N, W, R  int
}

var ErrQuorum = errors.New("kvstore: quórum não atingido")

// Put grava em todas as N réplicas e só confirma se W responderem.
// `ctx` é o clock lido antes (read-modify-write); `coordinator` é quem grava.
func (c *Cluster) Put(key, value string, ctx VectorClock, coordinator string) error {
	v := Versioned{Value: value, Clock: ctx.Increment(coordinator)}
	acks := 0
	for _, r := range c.Replicas[:c.N] {
		if r.put(key, v) {
			acks++
		}
	}
	if acks < c.W {
		return ErrQuorum
	}
	return nil
}

// Get consulta as réplicas até obter R respostas e devolve as versões mais
// recentes (mais de uma = conflito para o cliente reconciliar).
func (c *Cluster) Get(key string) ([]Versioned, error) {
	var all []Versioned
	answers := 0
	for _, r := range c.Replicas[:c.N] {
		vs, ok := r.get(key)
		if !ok {
			continue
		}
		answers++
		all = append(all, vs...)
		if answers == c.R {
			break
		}
	}
	if answers < c.R {
		return nil, ErrQuorum
	}
	return latest(all), nil
}

// latest remove versões dominadas por outras e duplicadas.
func latest(vs []Versioned) []Versioned {
	var out []Versioned
	for i, a := range vs {
		dominated := false
		for j, b := range vs {
			if i == j {
				continue
			}
			o := Compare(a.Clock, b.Clock)
			if o == Before || (o == Equal && j < i) {
				dominated = true
				break
			}
		}
		if !dominated {
			out = append(out, a)
		}
	}
	return out
}
