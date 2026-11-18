// Package kvstore ilustra os blocos de um key-value store distribuído no
// estilo Dynamo: vector clocks para detectar conflitos e quórum (N, W, R)
// para equilibrar consistência e disponibilidade.
package kvstore

// VectorClock mapeia servidor -> contador. Uma versão D1 é ancestral de D2 se
// todos os contadores de D1 são <= aos de D2. Se nenhuma é ancestral da outra,
// as escritas foram concorrentes = conflito que o cliente precisa resolver.
type VectorClock map[string]uint64

type Order int

const (
	Before     Order = iota // a aconteceu antes de b
	After                   // a aconteceu depois de b
	Equal                   // mesma versão
	Concurrent              // conflito
)

// Increment registra uma escrita feita pelo servidor `node`.
func (vc VectorClock) Increment(node string) VectorClock {
	out := vc.Copy()
	out[node]++
	return out
}

func (vc VectorClock) Copy() VectorClock {
	out := make(VectorClock, len(vc))
	for k, v := range vc {
		out[k] = v
	}
	return out
}

// Compare determina a relação causal entre duas versões.
func Compare(a, b VectorClock) Order {
	aLess, bLess := false, false
	for k := range union(a, b) {
		switch {
		case a[k] < b[k]:
			aLess = true
		case a[k] > b[k]:
			bLess = true
		}
	}
	switch {
	case aLess && bLess:
		return Concurrent
	case aLess:
		return Before
	case bLess:
		return After
	default:
		return Equal
	}
}

// Merge produz o relógio de uma versão que "resolve" o conflito:
// máximo componente a componente.
func Merge(a, b VectorClock) VectorClock {
	out := VectorClock{}
	for k := range union(a, b) {
		out[k] = max(a[k], b[k])
	}
	return out
}

func union(a, b VectorClock) map[string]struct{} {
	keys := map[string]struct{}{}
	for k := range a {
		keys[k] = struct{}{}
	}
	for k := range b {
		keys[k] = struct{}{}
	}
	return keys
}
