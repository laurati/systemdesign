// Package feed implementa um news feed com modelo HÍBRIDO de fanout:
//
//   - Fanout on write (push): ao publicar, o post_id é inserido no cache de
//     feed de cada seguidor. Leitura rapidíssima; escrita cara para quem tem
//     milhões de seguidores (o "problema da celebridade").
//   - Fanout on read (pull): o feed é montado na hora da leitura buscando os
//     posts de quem a pessoa segue. Escrita barata; leitura lenta.
//
// Híbrido: push para usuários comuns, pull para celebridades (acima de um limiar).
package feed

import (
	"slices"
	"sync"
)

type Post struct {
	ID       int64 // ID ordenável por tempo (Snowflake) — dispensa campo de timestamp
	AuthorID string
	Text     string
}

type Service struct {
	mu                 sync.RWMutex
	CelebrityThreshold int
	MaxFeedSize        int // limita o cache de feed por usuário (ex.: 500 ids)

	followers map[string]map[string]bool // autor -> seguidores
	following map[string]map[string]bool // usuário -> quem segue
	posts     map[int64]Post             // "post store"
	byAuthor  map[string][]int64         // posts de cada autor (para o pull)
	feedCache map[string][]int64         // feed pré-computado (para o push)
}

func NewService(celebrityThreshold, maxFeed int) *Service {
	return &Service{
		CelebrityThreshold: celebrityThreshold, MaxFeedSize: maxFeed,
		followers: map[string]map[string]bool{}, following: map[string]map[string]bool{},
		posts: map[int64]Post{}, byAuthor: map[string][]int64{}, feedCache: map[string][]int64{},
	}
}

func (s *Service) Follow(user, author string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.followers[author] == nil {
		s.followers[author] = map[string]bool{}
	}
	if s.following[user] == nil {
		s.following[user] = map[string]bool{}
	}
	s.followers[author][user] = true
	s.following[user][author] = true
}

func (s *Service) isCelebrity(author string) bool {
	return len(s.followers[author]) >= s.CelebrityThreshold
}

// Publish grava o post e faz fanout on write se o autor não é celebridade.
// Em produção o fanout é assíncrono: Publish enfileira e workers escrevem nos caches.
func (s *Service) Publish(p Post) (fanout int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.posts[p.ID] = p
	s.byAuthor[p.AuthorID] = append(s.byAuthor[p.AuthorID], p.ID)
	if s.isCelebrity(p.AuthorID) {
		return 0 // seguidores vão "puxar" na leitura
	}
	for f := range s.followers[p.AuthorID] {
		feed := append([]int64{p.ID}, s.feedCache[f]...)
		if len(feed) > s.MaxFeedSize {
			feed = feed[:s.MaxFeedSize]
		}
		s.feedCache[f] = feed
		fanout++
	}
	return fanout
}

// Feed mescla o cache (push) com os posts recentes das celebridades seguidas (pull).
func (s *Service) Feed(user string, limit int) []Post {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ids := slices.Clone(s.feedCache[user])
	for author := range s.following[user] {
		if s.isCelebrity(author) {
			ids = append(ids, s.byAuthor[author]...)
		}
	}
	slices.Sort(ids)
	ids = slices.Compact(ids)
	slices.Reverse(ids) // mais recentes primeiro
	out := make([]Post, 0, limit)
	for _, id := range ids {
		if len(out) == limit {
			break
		}
		out = append(out, s.posts[id]) // "hydration": id -> conteúdo completo
	}
	return out
}
