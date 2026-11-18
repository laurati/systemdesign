// Package filesync mostra a técnica central de um Google Drive / Dropbox:
// dividir arquivos em blocos, identificar cada bloco pelo hash do conteúdo e,
// numa atualização, enviar só os blocos que mudaram (delta sync).
//
// Benefícios: menos banda, retomada de upload, deduplicação entre arquivos e
// usuários (mesmo hash = mesmo bloco guardado uma vez no object storage).
package filesync

import (
	"crypto/sha256"
	"encoding/hex"
)

// Block é a unidade de upload/armazenamento (Dropbox usa até 4 MB).
type Block struct {
	Index int
	Hash  string
	Data  []byte
}

// Split divide os dados em blocos de tamanho fixo.
func Split(data []byte, size int) []Block {
	var out []Block
	for i := 0; i*size < len(data); i++ {
		end := min((i+1)*size, len(data))
		chunk := data[i*size : end]
		sum := sha256.Sum256(chunk)
		out = append(out, Block{Index: i, Hash: hex.EncodeToString(sum[:]), Data: chunk})
	}
	return out
}

// Manifest é o que o serviço de metadados guarda por versão de arquivo:
// a lista ordenada de hashes. O conteúdo vive no object storage (S3).
func Manifest(blocks []Block) []string {
	m := make([]string, len(blocks))
	for i, b := range blocks {
		m[i] = b.Hash
	}
	return m
}

// Changed devolve os blocos da nova versão que o servidor ainda não tem.
// `known` = conjunto de hashes já armazenados (de qualquer arquivo → dedup).
func Changed(newBlocks []Block, known map[string]bool) []Block {
	var out []Block
	for _, b := range newBlocks {
		if !known[b.Hash] {
			out = append(out, b)
		}
	}
	return out
}
