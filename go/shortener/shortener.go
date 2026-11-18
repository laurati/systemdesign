// Package shortener implementa um encurtador de URL usando
// "ID único + conversão base62" — a abordagem sem colisões.
//
// Fluxo de escrita:  longURL → já existe? devolve o short → senão gera ID
// único (ex.: Snowflake ou contador distribuído) → base62(ID) → salva.
// Fluxo de leitura:  GET /{short} → cache → banco → 301/302 para longURL.
package shortener

import (
	"errors"
	"net/http"
	"strings"
	"sync"
)

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

// Encode converte um inteiro para base62. 62^7 ≈ 3,5 trilhões de URLs com 7 chars.
func Encode(n uint64) string {
	if n == 0 {
		return string(alphabet[0])
	}
	var b [11]byte // 62^11 > 2^64
	i := len(b)
	for n > 0 {
		i--
		b[i] = alphabet[n%62]
		n /= 62
	}
	return string(b[i:])
}

func Decode(s string) (uint64, error) {
	var n uint64
	for _, c := range s {
		idx := strings.IndexRune(alphabet, c)
		if idx < 0 {
			return 0, errors.New("caractere inválido em base62")
		}
		n = n*62 + uint64(idx)
	}
	return n, nil
}

// IDGenerator abstrai o gerador de IDs únicos (Snowflake, ticket server, range de IDs…).
type IDGenerator interface{ Next() (int64, error) }

// Service guarda os mapeamentos. Em produção: tabela (id, short, long) em
// um banco + cache (Redis) na frente para as leituras (read-heavy ~100:1).
type Service struct {
	mu      sync.RWMutex
	ids     IDGenerator
	byShort map[string]string
	byLong  map[string]string // índice para não duplicar a mesma URL longa
}

func NewService(ids IDGenerator) *Service {
	return &Service{ids: ids, byShort: map[string]string{}, byLong: map[string]string{}}
}

func (s *Service) Shorten(long string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if short, ok := s.byLong[long]; ok {
		return short, nil
	}
	id, err := s.ids.Next()
	if err != nil {
		return "", err
	}
	short := Encode(uint64(id))
	s.byShort[short] = long
	s.byLong[long] = short
	return short, nil
}

func (s *Service) Resolve(short string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	long, ok := s.byShort[short]
	return long, ok
}

// ServeHTTP faz o redirecionamento.
//   - 301 (Moved Permanently): o navegador cacheia; menos carga, mas você perde analytics.
//   - 302 (Found): toda visita passa pelo serviço; permite contar cliques.
func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	long, ok := s.Resolve(strings.TrimPrefix(r.URL.Path, "/"))
	if !ok {
		http.NotFound(w, r)
		return
	}
	http.Redirect(w, r, long, http.StatusFound)
}
