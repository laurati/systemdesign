package ratelimit

import (
	"net"
	"net/http"
)

// Middleware aplica um Limiter a um http.Handler, usando o IP do cliente
// como chave. Ao rejeitar, responde 429 Too Many Requests com o header
// Retry-After — o cliente sabe que deve esperar em vez de repetir em loop.
func Middleware(l Limiter, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			key = r.RemoteAddr
		}
		if !l.Allow(key) {
			w.Header().Set("Retry-After", "1")
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
