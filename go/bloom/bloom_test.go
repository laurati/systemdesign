package bloom

import (
	"fmt"
	"testing"
)

func TestNoFalseNegativesAndLowFPR(t *testing.T) {
	const n = 50000
	f := New(n, 0.01)
	for i := 0; i < n; i++ {
		f.Add(fmt.Sprintf("https://site.com/page/%d", i))
	}
	for i := 0; i < n; i++ {
		if !f.MightContain(fmt.Sprintf("https://site.com/page/%d", i)) {
			t.Fatal("Bloom filter nunca pode ter falso negativo")
		}
	}
	fp := 0
	for i := n; i < 2*n; i++ {
		if f.MightContain(fmt.Sprintf("https://site.com/page/%d", i)) {
			fp++
		}
	}
	rate := float64(fp) / n
	t.Logf("m=%d bits (%.1f bits/item), k=%d, falso positivo=%.2f%%", f.m, float64(f.m)/n, f.k, rate*100)
	if rate > 0.02 {
		t.Fatalf("taxa de falso positivo alta demais: %.3f", rate)
	}
}
