package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// fakeClock devolve um tempo controlado pelo teste.
type fakeClock struct{ t time.Time }

func (f *fakeClock) Now() time.Time          { return f.t }
func (f *fakeClock) Advance(d time.Duration) { f.t = f.t.Add(d) }

func newClock() *fakeClock { return &fakeClock{t: time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)} }

func countAllowed(l Limiter, key string, n int) int {
	ok := 0
	for i := 0; i < n; i++ {
		if l.Allow(key) {
			ok++
		}
	}
	return ok
}

func TestTokenBucketBurstAndRefill(t *testing.T) {
	c := newClock()
	tb := NewTokenBucket(4, 2, c.Now) // 4 de burst, 2 tokens/s
	if got := countAllowed(tb, "u1", 10); got != 4 {
		t.Fatalf("burst: want 4, got %d", got)
	}
	c.Advance(time.Second) // +2 tokens
	if got := countAllowed(tb, "u1", 10); got != 2 {
		t.Fatalf("refill: want 2, got %d", got)
	}
	if !tb.Allow("u2") {
		t.Fatal("chaves diferentes devem ter baldes independentes")
	}
}

func TestLeakyBucket(t *testing.T) {
	c := newClock()
	lb := NewLeakyBucket(3, 1, c.Now)
	if got := countAllowed(lb, "u", 5); got != 3 {
		t.Fatalf("want 3, got %d", got)
	}
	c.Advance(2 * time.Second) // vazaram 2
	if got := countAllowed(lb, "u", 5); got != 2 {
		t.Fatalf("want 2, got %d", got)
	}
}

func TestFixedWindowBoundaryProblem(t *testing.T) {
	c := newClock()
	c.Advance(59 * time.Second) // 12:00:59
	fw := NewFixedWindow(5, time.Minute, c.Now)
	a := countAllowed(fw, "u", 5)
	c.Advance(time.Second) // 12:01:00 — nova janela
	b := countAllowed(fw, "u", 5)
	if a+b != 10 {
		t.Fatalf("o problema da borda deveria permitir 10 em 1s, got %d", a+b)
	}
}

func TestSlidingWindowLogIsExact(t *testing.T) {
	c := newClock()
	c.Advance(59 * time.Second)
	sl := NewSlidingWindowLog(5, time.Minute, c.Now)
	a := countAllowed(sl, "u", 5)
	c.Advance(time.Second)
	b := countAllowed(sl, "u", 5)
	if a != 5 || b != 0 {
		t.Fatalf("log não deve deixar passar na borda: a=%d b=%d", a, b)
	}
	c.Advance(time.Minute)
	if !sl.Allow("u") {
		t.Fatal("depois de uma janela inteira deve liberar")
	}
}

func TestSlidingWindowCounterSmoothsBoundary(t *testing.T) {
	c := newClock()
	sc := NewSlidingWindowCounter(10, time.Minute, c.Now)
	countAllowed(sc, "u", 10)               // janela anterior cheia
	c.Advance(time.Minute + 15*time.Second) // 25% da nova janela
	// estimativa = 0 + 10*0.75 = 7.5 → cabem 2 (7.5+1<=10, 8.5+1<=10)
	if got := countAllowed(sc, "u", 10); got != 2 {
		t.Fatalf("want 2, got %d", got)
	}
}

func TestMiddleware(t *testing.T) {
	h := Middleware(NewFixedWindow(1, time.Minute, nil), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	codes := []int{}
	for i := 0; i < 2; i++ {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
		codes = append(codes, rec.Code)
	}
	if codes[0] != 200 || codes[1] != 429 {
		t.Fatalf("want [200 429], got %v", codes)
	}
}
