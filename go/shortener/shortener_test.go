package shortener

import (
	"net/http/httptest"
	"testing"
)

type counter struct{ n int64 }

func (c *counter) Next() (int64, error) { c.n++; return c.n, nil }

func TestBase62RoundTrip(t *testing.T) {
	for _, n := range []uint64{0, 1, 61, 62, 11157, 2009215674938, 1<<63 + 12345} {
		s := Encode(n)
		got, err := Decode(s)
		if err != nil || got != n {
			t.Fatalf("roundtrip %d -> %q -> %d (%v)", n, s, got, err)
		}
	}
	if Encode(11157) != "2TX" {
		t.Fatalf("11157 deveria virar 2TX, got %s", Encode(11157))
	}
}

func TestShortenIdempotentAndRedirect(t *testing.T) {
	s := NewService(&counter{n: 11156})
	a, _ := s.Shorten("https://example.com/a/very/long/path")
	b, _ := s.Shorten("https://example.com/a/very/long/path")
	if a != b || a != "2TX" {
		t.Fatalf("mesma URL deve devolver o mesmo short: %s %s", a, b)
	}
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest("GET", "/"+a, nil))
	if rec.Code != 302 || rec.Header().Get("Location") != "https://example.com/a/very/long/path" {
		t.Fatalf("redirect errado: %d %s", rec.Code, rec.Header().Get("Location"))
	}
	rec = httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest("GET", "/nope", nil))
	if rec.Code != 404 {
		t.Fatal("short inexistente deve dar 404")
	}
}
