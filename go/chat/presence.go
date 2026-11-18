// Package chat contém duas peças de um sistema de chat:
//
//   - Presence: status online/offline via heartbeat. Em vez de marcar offline
//     a cada desconexão do WebSocket (redes móveis oscilam!), o cliente manda
//     um heartbeat a cada X s; se nada chegar em `timeout`, fica offline.
//   - Inbox com sequência por canal: cada mensagem de um canal 1:1 ou grupo
//     recebe um message_id crescente *local ao canal*, e o cliente sincroniza
//     pedindo "tudo depois do meu cur_max_message_id".
package chat

import (
	"sync"
	"time"
)

type Presence struct {
	mu       sync.Mutex
	timeout  time.Duration
	now      func() time.Time
	lastBeat map[string]time.Time
}

func NewPresence(timeout time.Duration, now func() time.Time) *Presence {
	if now == nil {
		now = time.Now
	}
	return &Presence{timeout: timeout, now: now, lastBeat: map[string]time.Time{}}
}

func (p *Presence) Heartbeat(user string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.lastBeat[user] = p.now()
}

func (p *Presence) Online(user string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	t, ok := p.lastBeat[user]
	return ok && p.now().Sub(t) <= p.timeout
}

// ---------------------------------------------------------------------------

type Message struct {
	ChannelID string
	Seq       int64 // crescente dentro do canal
	From      string
	Text      string
}

type Store struct {
	mu       sync.Mutex
	seq      map[string]int64 // em produção: INCR no Redis por canal, ou ID Snowflake
	messages map[string][]Message
}

func NewStore() *Store { return &Store{seq: map[string]int64{}, messages: map[string][]Message{}} }

func (s *Store) Append(channel, from, text string) Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.seq[channel]++
	m := Message{ChannelID: channel, Seq: s.seq[channel], From: from, Text: text}
	s.messages[channel] = append(s.messages[channel], m)
	return m
}

// Since devolve as mensagens com Seq > after — é o que um dispositivo pede ao reconectar.
func (s *Store) Since(channel string, after int64) []Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	msgs := s.messages[channel]
	// Seq começa em 1 e é contíguo, então o índice é direto.
	if after >= int64(len(msgs)) {
		return nil
	}
	return append([]Message(nil), msgs[after:]...)
}
