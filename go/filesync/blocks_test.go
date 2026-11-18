package filesync

import (
	"bytes"
	"testing"
)

func TestDeltaSyncUploadsOnlyChangedBlocks(t *testing.T) {
	v1 := bytes.Repeat([]byte("A"), 4096*10) // 10 blocos de 4 KB
	b1 := Split(v1, 4096)
	known := map[string]bool{}
	for _, h := range Manifest(b1) {
		known[h] = true
	}

	v2 := bytes.Clone(v1)
	copy(v2[4096*3:], []byte("edição no bloco 3"))
	v2 = append(v2, []byte("novo final")...)
	b2 := Split(v2, 4096)

	changed := Changed(b2, known)
	if len(changed) != 2 || changed[0].Index != 3 || changed[1].Index != 10 {
		idx := []int{}
		for _, b := range changed {
			idx = append(idx, b.Index)
		}
		t.Fatalf("esperava blocos [3 10], got %v", idx)
	}
	t.Logf("arquivo de %d bytes: enviados %d de %d blocos", len(v2), len(changed), len(b2))
}
