// Package consistenthash implementa um anel de hash consistente com nós virtuais.
//
// Ideia: servidores e chaves são mapeados para o mesmo espaço de hash (um anel
// de 0 a 2^32-1). Uma chave pertence ao primeiro servidor encontrado andando
// no sentido horário. Ao adicionar/remover um servidor, só as chaves do trecho
// vizinho mudam de dono (~K/N chaves), em vez de quase todas (hash % N).
package consistenthash

import (
	"hash/crc32"
	"slices"
	"strconv"
	"sync"
)

type Ring struct {
	mu       sync.RWMutex
	replicas int               // nós virtuais por servidor
	hashes   []uint32          // posições ordenadas no anel
	owner    map[uint32]string // posição -> servidor físico
}

// New cria um anel. Mais réplicas virtuais = distribuição mais uniforme
// (desvio padrão menor), ao custo de mais memória para o índice.
func New(replicas int) *Ring {
	return &Ring{replicas: replicas, owner: map[uint32]string{}}
}

func hashKey(s string) uint32 { return crc32.ChecksumIEEE([]byte(s)) }

func (r *Ring) Add(servers ...string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, s := range servers {
		for i := 0; i < r.replicas; i++ {
			h := hashKey(s + "#" + strconv.Itoa(i))
			r.owner[h] = s
			r.hashes = append(r.hashes, h)
		}
	}
	slices.Sort(r.hashes)
}

func (r *Ring) Remove(server string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	kept := r.hashes[:0]
	for _, h := range r.hashes {
		if r.owner[h] == server {
			delete(r.owner, h)
			continue
		}
		kept = append(kept, h)
	}
	r.hashes = kept
}

// Get devolve o servidor responsável pela chave.
func (r *Ring) Get(key string) string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if len(r.hashes) == 0 {
		return ""
	}
	return r.owner[r.hashes[r.search(hashKey(key))]]
}

// GetN devolve os N primeiros servidores *distintos* no sentido horário —
// é assim que Dynamo/Cassandra escolhem as réplicas de uma chave.
func (r *Ring) GetN(key string, n int) []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var out []string
	seen := map[string]bool{}
	start := r.search(hashKey(key))
	for i := 0; i < len(r.hashes) && len(out) < n; i++ {
		s := r.owner[r.hashes[(start+i)%len(r.hashes)]]
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

// search faz busca binária pela primeira posição >= h (com wrap-around).
func (r *Ring) search(h uint32) int {
	i, _ := slices.BinarySearch(r.hashes, h)
	if i == len(r.hashes) {
		i = 0 // passou do fim: volta ao início do anel
	}
	return i
}
