package feed

import (
	"fmt"
	"testing"
)

func TestHybridFanout(t *testing.T) {
	s := NewService(3, 100)
	s.Follow("ana", "bob")
	for i := 0; i < 5; i++ { // star tem 5 seguidores → celebridade
		s.Follow(fmt.Sprintf("fan%d", i), "star")
	}
	s.Follow("ana", "star")

	if n := s.Publish(Post{ID: 1, AuthorID: "bob", Text: "oi"}); n != 1 {
		t.Fatalf("bob (comum) deveria fazer fanout para 1, fez %d", n)
	}
	if n := s.Publish(Post{ID: 2, AuthorID: "star", Text: "show hoje"}); n != 0 {
		t.Fatal("celebridade não faz fanout on write")
	}
	s.Publish(Post{ID: 3, AuthorID: "bob", Text: "tchau"})

	feed := s.Feed("ana", 10)
	got := []int64{}
	for _, p := range feed {
		got = append(got, p.ID)
	}
	if fmt.Sprint(got) != "[3 2 1]" {
		t.Fatalf("feed deveria mesclar push+pull em ordem: %v", got)
	}
}
