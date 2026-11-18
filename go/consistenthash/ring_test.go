package consistenthash

import (
	"fmt"
	"testing"
)

func keys(n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = fmt.Sprintf("user:%d", i)
	}
	return out
}

func TestMinimalRemapping(t *testing.T) {
	r := New(200)
	r.Add("s0", "s1", "s2", "s3")
	ks := keys(20000)
	before := map[string]string{}
	for _, k := range ks {
		before[k] = r.Get(k)
	}

	r.Add("s4")
	moved := 0
	for _, k := range ks {
		now := r.Get(k)
		if now != before[k] {
			moved++
			if now != "s4" {
				t.Fatalf("chave %s mudou para %s — só deveria ir para o novo nó", k, now)
			}
		}
	}
	// Esperado ~1/5 das chaves. Com hash % N seriam ~80%.
	frac := float64(moved) / float64(len(ks))
	if frac < 0.12 || frac > 0.28 {
		t.Fatalf("fração movida %.2f fora do esperado (~0.20)", frac)
	}
	t.Logf("adicionar 1 nó a 4 moveu %.1f%% das chaves", frac*100)
}

func TestModuloRemapsAlmostEverything(t *testing.T) {
	// Contraste: hash % N.
	ks := keys(20000)
	moved := 0
	for _, k := range ks {
		h := hashKey(k)
		if h%4 != h%5 {
			moved++
		}
	}
	t.Logf("com hash %% N, ir de 4 para 5 servidores moveu %.1f%% das chaves", float64(moved)/float64(len(ks))*100)
	if moved < len(ks)/2 {
		t.Fatal("esperava remapeamento massivo com módulo")
	}
}

func TestDistributionWithVirtualNodes(t *testing.T) {
	for _, replicas := range []int{1, 200} {
		r := New(replicas)
		r.Add("a", "b", "c", "d")
		count := map[string]int{}
		for _, k := range keys(40000) {
			count[r.Get(k)]++
		}
		lo, hi := 1<<30, 0
		for _, c := range count {
			lo, hi = min(lo, c), max(hi, c)
		}
		t.Logf("replicas=%d  min=%d max=%d", replicas, lo, hi)
		if replicas == 200 && float64(hi)/float64(lo) > 1.35 {
			t.Fatalf("com 200 nós virtuais a carga deveria ser equilibrada: %v", count)
		}
	}
}

func TestGetNDistinct(t *testing.T) {
	r := New(50)
	r.Add("a", "b", "c")
	got := r.GetN("k", 3)
	if len(got) != 3 || got[0] == got[1] || got[1] == got[2] || got[0] == got[2] {
		t.Fatalf("esperava 3 servidores distintos, got %v", got)
	}
	r.Remove("b")
	for _, k := range keys(1000) {
		if r.Get(k) == "b" {
			t.Fatal("servidor removido ainda recebe chaves")
		}
	}
}
