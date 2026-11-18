// Package bloom implementa um Bloom filter: estrutura probabilística que
// responde "com certeza NÃO está" ou "provavelmente está" usando poucos bits.
//
// Onde aparece em system design:
//   - Web crawler: "já visitei esta URL?" sem guardar bilhões de strings.
//   - LSM trees (Cassandra, RocksDB, Bigtable): evita ler SSTables que não têm a chave.
//   - Encurtador com hash: checar colisão antes de ir ao banco.
package bloom

import (
	"hash/fnv"
	"math"
)

type Filter struct {
	bits []uint64
	m    uint64 // nº de bits
	k    uint64 // nº de funções de hash
}

// New dimensiona o filtro para n itens com taxa de falso positivo p:
//
//	m = -n·ln(p) / (ln 2)²     k = (m/n)·ln 2
//
// Ex.: 1 bilhão de URLs com p=1% ≈ 9,6 bits/item ≈ 1,2 GB — cabe em memória.
func New(n int, p float64) *Filter {
	m := uint64(math.Ceil(-float64(n) * math.Log(p) / (math.Ln2 * math.Ln2)))
	k := uint64(math.Round(float64(m) / float64(n) * math.Ln2))
	return &Filter{bits: make([]uint64, (m+63)/64), m: m, k: max(k, 1)}
}

// Double hashing (Kirsch–Mitzenmacher): gi(x) = h1 + i·h2 simula k hashes.
func (f *Filter) hashes(s string) (uint64, uint64) {
	h := fnv.New64a()
	h.Write([]byte(s))
	a := h.Sum64()
	return a, (a >> 33) | 1
}

func (f *Filter) Add(s string) {
	h1, h2 := f.hashes(s)
	for i := uint64(0); i < f.k; i++ {
		pos := (h1 + i*h2) % f.m
		f.bits[pos/64] |= 1 << (pos % 64)
	}
}

func (f *Filter) MightContain(s string) bool {
	h1, h2 := f.hashes(s)
	for i := uint64(0); i < f.k; i++ {
		pos := (h1 + i*h2) % f.m
		if f.bits[pos/64]&(1<<(pos%64)) == 0 {
			return false
		}
	}
	return true
}
