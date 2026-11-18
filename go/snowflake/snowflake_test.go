package snowflake

import (
	"sync"
	"testing"
	"time"
)

func TestUniqueAndSortedConcurrent(t *testing.T) {
	g, _ := New(1, 7)
	const workers, perWorker = 8, 20000
	var mu sync.Mutex
	seen := make(map[int64]bool, workers*perWorker)
	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			local := make([]int64, 0, perWorker)
			for i := 0; i < perWorker; i++ {
				id, err := g.Next()
				if err != nil {
					t.Error(err)
					return
				}
				if len(local) > 0 && id <= local[len(local)-1] {
					t.Error("IDs de uma mesma goroutine devem ser crescentes")
					return
				}
				local = append(local, id)
			}
			mu.Lock()
			for _, id := range local {
				if seen[id] {
					t.Errorf("ID duplicado: %d", id)
				}
				seen[id] = true
			}
			mu.Unlock()
		}()
	}
	wg.Wait()
}

func TestParts(t *testing.T) {
	g, _ := New(3, 9)
	fixed := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)
	g.now = func() time.Time { return fixed }
	id, _ := g.Next()
	ts, dc, m, seq := Parts(id)
	if !ts.Equal(fixed) || dc != 3 || m != 9 || seq != 0 {
		t.Fatalf("parts erradas: %v %d %d %d", ts, dc, m, seq)
	}
}

func TestClockBackwards(t *testing.T) {
	g, _ := New(0, 0)
	now := time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)
	g.now = func() time.Time { return now }
	g.Next()
	now = now.Add(-time.Second)
	if _, err := g.Next(); err != ErrClockMovedBackwards {
		t.Fatal("deveria detectar relógio voltando")
	}
}
