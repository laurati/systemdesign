package kvstore

import "testing"

func TestVectorClockOrdering(t *testing.T) {
	d1 := VectorClock{}.Increment("Sx") // [Sx:1]
	d2 := d1.Increment("Sx")            // [Sx:2]
	d3 := d2.Increment("Sy")            // [Sx:2, Sy:1]
	d4 := d2.Increment("Sz")            // [Sx:2, Sz:1]
	if Compare(d1, d2) != Before || Compare(d2, d3) != Before {
		t.Fatal("d1 < d2 < d3")
	}
	if Compare(d3, d4) != Concurrent {
		t.Fatal("d3 e d4 são concorrentes (conflito)")
	}
	d5 := Merge(d3, d4).Increment("Sx") // cliente resolve: [Sx:3, Sy:1, Sz:1]
	if Compare(d3, d5) != Before || Compare(d4, d5) != Before {
		t.Fatal("versão reconciliada deve superar as duas")
	}
}

func newCluster(n, w, r int) *Cluster {
	c := &Cluster{N: n, W: w, R: r}
	for _, name := range []string{"A", "B", "C"} {
		c.Replicas = append(c.Replicas, NewReplica(name))
	}
	return c
}

func TestQuorumToleratesOneFailure(t *testing.T) {
	c := newCluster(3, 2, 2)
	c.Replicas[2].Down = true
	if err := c.Put("k", "v1", nil, "A"); err != nil {
		t.Fatal("W=2 com 1 nó fora deve funcionar:", err)
	}
	vs, err := c.Get("k")
	if err != nil || len(vs) != 1 || vs[0].Value != "v1" {
		t.Fatalf("leitura: %v %v", vs, err)
	}
	c.Replicas[1].Down = true
	if err := c.Put("k", "v2", vs[0].Clock, "A"); err != ErrQuorum {
		t.Fatal("com 2 nós fora, W=2 não é atingido")
	}
}

func TestConcurrentWritesProduceSiblings(t *testing.T) {
	c := newCluster(3, 1, 3)
	_ = c.Put("cart", "[livro]", nil, "A")
	base, _ := c.Get("cart")
	// Dois clientes leem a mesma versão e escrevem via coordenadores diferentes.
	_ = c.Put("cart", "[livro, caneta]", base[0].Clock, "A")
	_ = c.Put("cart", "[livro, café]", base[0].Clock, "B")
	vs, _ := c.Get("cart")
	if len(vs) != 2 {
		t.Fatalf("esperava 2 versões em conflito, got %v", vs)
	}
	// Cliente reconcilia (ex.: união do carrinho) e grava com o clock mesclado.
	merged := Merge(vs[0].Clock, vs[1].Clock)
	_ = c.Put("cart", "[livro, caneta, café]", merged, "A")
	vs, _ = c.Get("cart")
	if len(vs) != 1 || vs[0].Value != "[livro, caneta, café]" {
		t.Fatalf("conflito não resolvido: %v", vs)
	}
}
