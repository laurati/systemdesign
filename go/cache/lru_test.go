package cache

import (
	"testing"
	"time"
)

func TestLRUEvictionAndTTL(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	c := NewLRU[string](2, time.Minute, func() time.Time { return now })
	c.Set("a", "1")
	c.Set("b", "2")
	c.Get("a")      // a vira o mais recente
	c.Set("c", "3") // evicta b
	if _, ok := c.Get("b"); ok {
		t.Fatal("b deveria ter sido evictado")
	}
	now = now.Add(2 * time.Minute)
	if _, ok := c.Get("a"); ok {
		t.Fatal("a deveria ter expirado")
	}
}

func TestCacheAside(t *testing.T) {
	c := NewLRU[string](10, time.Minute, nil)
	dbHits := 0
	load := func(k string) (string, error) { dbHits++; return "perfil de " + k, nil }
	for i := 0; i < 5; i++ {
		c.GetOrLoad("user:1", load)
	}
	if dbHits != 1 {
		t.Fatalf("só o primeiro acesso deve ir ao banco, foram %d", dbHits)
	}
	c.Delete("user:1") // escrita no banco → invalida
	c.GetOrLoad("user:1", load)
	if dbHits != 2 {
		t.Fatal("após invalidação deve recarregar")
	}
}
