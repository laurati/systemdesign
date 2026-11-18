package crawler

import (
	"testing"
	"time"
)

func TestFrontierPolitenessPriorityDedup(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	f := NewFrontier(time.Second, func() time.Time { return now })

	f.Add("https://a.com/1", 1)
	f.Add("https://a.com/2", 9) // mais prioritária
	f.Add("https://b.com/1", 1)
	if f.Add("https://a.com/2#top", 5) {
		t.Fatal("fragmento não deve criar URL nova (dedup)")
	}
	if f.Add("ftp://x.com/file", 1) {
		t.Fatal("só http/https")
	}

	got := []string{f.Next(), f.Next()}
	if got[0] != "https://a.com/2" || got[1] != "https://b.com/1" {
		t.Fatalf("ordem inesperada: %v", got)
	}
	if u := f.Next(); u != "" {
		t.Fatalf("a.com ainda está em cooldown, mas recebeu %s", u)
	}
	now = now.Add(time.Second)
	if u := f.Next(); u != "https://a.com/1" {
		t.Fatalf("após o delay, a.com volta: got %q", u)
	}
}
