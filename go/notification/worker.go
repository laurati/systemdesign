// Package notification mostra o núcleo confiável de um worker de notificações:
//
//   - idempotência: o mesmo evento (notification_id) nunca é enviado duas vezes,
//     mesmo que a fila entregue a mensagem de novo (at-least-once);
//   - retry com exponential backoff + jitter para falhas transitórias do provedor
//     (APNs, FCM, Twilio, SendGrid);
//   - dead-letter: depois de N tentativas a mensagem vai para análise manual.
package notification

import (
	"context"
	"errors"
	"math/rand/v2"
	"sync"
	"time"
)

type Message struct {
	ID      string // notification_id gerado na origem — chave de idempotência
	UserID  string
	Channel string // "push", "sms", "email"
	Body    string
}

// Provider é o serviço terceiro que efetivamente entrega.
type Provider interface {
	Send(ctx context.Context, m Message) error
}

// ErrPermanent indica que não adianta tentar de novo (token de device inválido, e-mail inexistente).
var ErrPermanent = errors.New("falha permanente")

type Worker struct {
	Provider    Provider
	MaxAttempts int
	BaseDelay   time.Duration
	Sleep       func(time.Duration) // injetável nos testes

	mu         sync.Mutex
	sent       map[string]bool // em produção: Redis SETNX com TTL ou tabela com unique key
	DeadLetter []Message
}

func (w *Worker) Handle(ctx context.Context, m Message) error {
	w.mu.Lock()
	if w.sent == nil {
		w.sent = map[string]bool{}
	}
	if w.sent[m.ID] {
		w.mu.Unlock()
		return nil // duplicata: já entregue, ack e segue
	}
	w.mu.Unlock()

	var err error
	for attempt := 0; attempt < w.MaxAttempts; attempt++ {
		if err = w.Provider.Send(ctx, m); err == nil {
			w.mu.Lock()
			w.sent[m.ID] = true
			w.mu.Unlock()
			return nil
		}
		if errors.Is(err, ErrPermanent) {
			break
		}
		// backoff: base·2^tentativa + jitter (evita "thundering herd" de retries sincronizados)
		backoff := w.BaseDelay << attempt
		jitter := time.Duration(rand.Int64N(int64(w.BaseDelay) + 1))
		w.Sleep(backoff + jitter)
	}
	w.mu.Lock()
	w.DeadLetter = append(w.DeadLetter, m)
	w.mu.Unlock()
	return err
}
