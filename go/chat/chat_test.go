package chat

import (
	"testing"
	"time"
)

func TestPresenceHeartbeat(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	p := NewPresence(30*time.Second, func() time.Time { return now })
	p.Heartbeat("ana")
	now = now.Add(20 * time.Second)
	if !p.Online("ana") {
		t.Fatal("20s sem heartbeat ainda é online")
	}
	now = now.Add(15 * time.Second)
	if p.Online("ana") {
		t.Fatal("35s sem heartbeat deve ser offline")
	}
}

func TestMultiDeviceSync(t *testing.T) {
	s := NewStore()
	s.Append("ana:bob", "ana", "oi")
	s.Append("ana:bob", "bob", "olá")
	phoneMax := int64(2) // celular já viu até a 2
	s.Append("ana:bob", "ana", "tudo bem?")
	laptopMax := int64(0) // laptop ficou offline

	if got := s.Since("ana:bob", phoneMax); len(got) != 1 || got[0].Seq != 3 {
		t.Fatalf("celular deveria receber só a 3: %v", got)
	}
	if got := s.Since("ana:bob", laptopMax); len(got) != 3 {
		t.Fatalf("laptop deveria receber 3: %v", got)
	}
}
