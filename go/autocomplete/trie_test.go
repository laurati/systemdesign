package autocomplete

import "testing"

func TestSuggestTopK(t *testing.T) {
	tr := Build(map[string]int{
		"tree": 10, "true": 35, "try": 29, "toy": 14, "wish": 25, "win": 50, "trie": 3,
	}, 2)
	got := tr.Suggest("tr")
	if len(got) != 2 || got[0].Query != "true" || got[1].Query != "try" {
		t.Fatalf("top-2 de 'tr' errado: %v", got)
	}
	if got := tr.Suggest("w"); got[0].Query != "win" {
		t.Fatalf("got %v", got)
	}
	if tr.Suggest("xyz") != nil {
		t.Fatal("prefixo inexistente deve devolver nil")
	}
}
