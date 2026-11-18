// Package cache implementa um cache LRU com TTL e o padrão cache-aside.
//
// Cache-aside (lazy loading), o padrão mais comum em entrevistas:
//  1. a aplicação procura no cache;
//  2. miss → lê do banco e grava no cache com TTL;
//  3. na escrita → atualiza o banco e INVALIDA (delete) a chave no cache.
package cache

import (
	"container/list"
	"sync"
	"time"
)

type entry[V any] struct {
	key     string
	value   V
	expires time.Time
}

type LRU[V any] struct {
	mu    sync.Mutex
	cap   int
	ttl   time.Duration
	now   func() time.Time
	order *list.List               // frente = mais recente
	items map[string]*list.Element // O(1) para achar o nó
}

func NewLRU[V any](capacity int, ttl time.Duration, now func() time.Time) *LRU[V] {
	if now == nil {
		now = time.Now
	}
	return &LRU[V]{cap: capacity, ttl: ttl, now: now, order: list.New(), items: map[string]*list.Element{}}
}

func (c *LRU[V]) Get(key string) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var zero V
	el, ok := c.items[key]
	if !ok {
		return zero, false
	}
	e := el.Value.(*entry[V])
	if c.now().After(e.expires) {
		c.order.Remove(el)
		delete(c.items, key)
		return zero, false
	}
	c.order.MoveToFront(el)
	return e.value, true
}

func (c *LRU[V]) Set(key string, v V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[key]; ok {
		e := el.Value.(*entry[V])
		e.value, e.expires = v, c.now().Add(c.ttl)
		c.order.MoveToFront(el)
		return
	}
	c.items[key] = c.order.PushFront(&entry[V]{key, v, c.now().Add(c.ttl)})
	if c.order.Len() > c.cap {
		oldest := c.order.Back() // política de evicção: menos recentemente usado
		c.order.Remove(oldest)
		delete(c.items, oldest.Value.(*entry[V]).key)
	}
}

func (c *LRU[V]) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[key]; ok {
		c.order.Remove(el)
		delete(c.items, key)
	}
}

// GetOrLoad implementa cache-aside. `load` é a ida ao banco.
func (c *LRU[V]) GetOrLoad(key string, load func(string) (V, error)) (V, error) {
	if v, ok := c.Get(key); ok {
		return v, nil
	}
	v, err := load(key)
	if err != nil {
		return v, err
	}
	c.Set(key, v)
	return v, nil
}
