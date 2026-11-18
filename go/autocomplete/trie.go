// Package autocomplete implementa uma trie com top-k pré-computado em cada nó.
//
// Busca ingênua: achar o nó do prefixo (O(p)) e percorrer toda a subárvore
// para encontrar as k consultas mais frequentes — lento para prefixos curtos.
// Otimização clássica: cada nó guarda os seus top-k. A consulta vira O(p),
// em troca de mais memória e de uma reconstrução periódica (offline, ex.: semanal)
// a partir dos logs agregados de busca.
package autocomplete

import (
	"sort"
	"strings"
)

type Suggestion struct {
	Query string
	Freq  int
}

type node struct {
	children map[rune]*node
	top      []Suggestion
}

type Trie struct {
	root *node
	k    int
}

func NewTrie(k int) *Trie { return &Trie{root: &node{children: map[rune]*node{}}, k: k} }

// Build constrói a trie a partir de frequências agregadas (saída do job de analytics).
func Build(freq map[string]int, k int) *Trie {
	t := NewTrie(k)
	for q, f := range freq {
		t.insert(strings.ToLower(q), f)
	}
	return t
}

func (t *Trie) insert(q string, f int) {
	s := Suggestion{q, f}
	n := t.root
	t.offer(n, s)
	for _, r := range q {
		child, ok := n.children[r]
		if !ok {
			child = &node{children: map[rune]*node{}}
			n.children[r] = child
		}
		n = child
		t.offer(n, s)
	}
}

// offer mantém em cada nó apenas os k melhores.
func (t *Trie) offer(n *node, s Suggestion) {
	n.top = append(n.top, s)
	sort.Slice(n.top, func(i, j int) bool {
		if n.top[i].Freq != n.top[j].Freq {
			return n.top[i].Freq > n.top[j].Freq
		}
		return n.top[i].Query < n.top[j].Query
	})
	if len(n.top) > t.k {
		n.top = n.top[:t.k]
	}
}

// Suggest é O(len(prefix)): desce até o nó e devolve o top-k cacheado.
func (t *Trie) Suggest(prefix string) []Suggestion {
	n := t.root
	for _, r := range strings.ToLower(prefix) {
		next, ok := n.children[r]
		if !ok {
			return nil
		}
		n = next
	}
	return n.top
}
