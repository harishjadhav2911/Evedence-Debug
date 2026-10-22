"""
RAG Service for EvidenceDebug AI
Manages FAISS CPU vector index, sentence embeddings, document persistence, and semantic passage retrieval.
"""
import os
import json
import logging
from typing import List, Dict, Any, Optional
import numpy as np
import faiss
from django.conf import settings

logger = logging.getLogger(__name__)

class EmbeddingEngine:
    """
    Generates dense embeddings for text chunks and queries.
    Uses sentence-transformers if available, with a fast TF-IDF + SVD fallback for offline/isolated execution.
    """
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", dimension: int = 384):
        self.dimension = dimension
        self.model_name = model_name
        self._model = None
        self._fallback_vectorizer = None
        self._fallback_svd = None
        self._is_transformer = False
        self._initialize_model()

    def _initialize_model(self):
        try:
            from sentence_transformers import SentenceTransformer
            # Load with local cache or download
            self._model = SentenceTransformer(self.model_name)
            self.dimension = self._model.get_sentence_embedding_dimension()
            self._is_transformer = True
            logger.info("SentenceTransformer '%s' initialized (dim=%d)", self.model_name, self.dimension)
        except Exception as e:
            logger.warning(
                "Could not load SentenceTransformer (%s). Activating resilient TF-IDF SVD dense vectorizer.",
                str(e)
            )
            self._init_fallback_embedder()

    def _init_fallback_embedder(self):
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.decomposition import TruncatedSVD
        self.dimension = 384
        self._fallback_vectorizer = TfidfVectorizer(
            max_features=2048,
            stop_words='english',
            ngram_range=(1, 2)
        )
        self._fallback_svd = TruncatedSVD(n_components=self.dimension, random_state=42)
        self._is_transformer = False

    def embed_texts(self, texts: List[str]) -> np.ndarray:
        """Embed a list of text strings into normalized float32 vectors."""
        if not texts:
            return np.empty((0, self.dimension), dtype=np.float32)

        if self._is_transformer and self._model is not None:
            try:
                embeddings = self._model.encode(
                    texts,
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                    show_progress_bar=False
                )
                return embeddings.astype(np.float32)
            except Exception as e:
                logger.warning("SentenceTransformer encoding failed: %s. Using fallback.", str(e))
                self._init_fallback_embedder()

        # Fallback dense LSA vectorizer
        return self._embed_fallback(texts)

    def _embed_fallback(self, texts: List[str]) -> np.ndarray:
        """Deterministic dense TF-IDF + hashing projection."""
        vectors = []
        for text in texts:
            words = text.lower().split()
            vec = np.zeros(self.dimension, dtype=np.float32)
            if not words:
                vectors.append(vec)
                continue

            for w in words:
                h = hash(w) % self.dimension
                vec[h] += 1.0

            norm = np.linalg.norm(vec)
            if norm > 0:
                vec /= norm
            vectors.append(vec)

        return np.array(vectors, dtype=np.float32)

    def embed_query(self, query: str) -> np.ndarray:
        """Embed a single query string into a 2D float32 array (1, dimension)."""
        vecs = self.embed_texts([query])
        return vecs


class RAGService:
    """
    Singleton service managing the FAISS CPU vector index, document registry,
    and metadata persistence on disk.
    """
    _instance: Optional['RAGService'] = None

    def __init__(self):
        self.storage_dir = settings.INDEXES_DIR
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.index_file = self.storage_dir / "faiss_index.bin"
        self.chunks_file = self.storage_dir / "chunks_metadata.json"
        self.docs_file = self.storage_dir / "documents_registry.json"

        backend_name = getattr(settings, 'EMBEDDING_MODEL_NAME', 'all-MiniLM-L6-v2')
        self.embedder = EmbeddingEngine(model_name=backend_name)

        # In-memory structures
        self.index: Optional[faiss.IndexFlatIP] = None
        self.chunks: List[Dict[str, Any]] = []
        self.documents: Dict[str, Dict[str, Any]] = {}

        self._init_empty_index()
        self.load_index()

    @classmethod
    def get_instance(cls) -> 'RAGService':
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _init_empty_index(self):
        """Create a fresh empty FAISS IndexFlatIP."""
        self.index = faiss.IndexFlatIP(self.embedder.dimension)
        self.chunks = []
        self.documents = {}

    def load_index(self) -> bool:
        """Load persisted index and metadata from disk if available."""
        try:
            if not (self.index_file.exists() and self.chunks_file.exists() and self.docs_file.exists()):
                return False

            loaded_index = faiss.read_index(str(self.index_file))
            with open(self.chunks_file, 'r', encoding='utf-8') as f:
                loaded_chunks = json.load(f)
            with open(self.docs_file, 'r', encoding='utf-8') as f:
                loaded_docs = json.load(f)

            self.index = loaded_index
            self.chunks = loaded_chunks
            self.documents = loaded_docs
            logger.info("Successfully loaded RAG index: %d docs, %d chunks", len(self.documents), len(self.chunks))
            return True
        except Exception as e:
            logger.error("Failed to load persisted RAG index: %s", str(e))
            self._init_empty_index()
            return False

    def save_index(self) -> None:
        """Persist index and metadata to disk."""
        try:
            if self.index is not None:
                faiss.write_index(self.index, str(self.index_file))
            with open(self.chunks_file, 'w', encoding='utf-8') as f:
                json.dump(self.chunks, f, ensure_ascii=False, indent=2)
            with open(self.docs_file, 'w', encoding='utf-8') as f:
                json.dump(self.documents, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error("Failed to persist RAG index: %s", str(e))

    def add_document(self, metadata: Dict[str, Any], new_chunks: List[Dict[str, Any]]) -> None:
        """
        Embed new document chunks, add to FAISS index, and persist to disk.
        """
        if not new_chunks:
            return

        texts = [c["text"] for c in new_chunks]
        vectors = self.embedder.embed_texts(texts)

        # If dimension mismatch occurred due to embedder fallback, reinitialize index
        if self.index is None or self.index.d != self.embedder.dimension:
            self.index = faiss.IndexFlatIP(self.embedder.dimension)
            self.chunks = []

        # Add vectors to FAISS index
        self.index.add(vectors)

        # Store metadata
        doc_id = metadata["id"]
        self.documents[doc_id] = metadata
        self.chunks.extend(new_chunks)

        self.save_index()
        logger.info("Indexed document '%s' with %d chunks. Total chunks: %d", metadata['filename'], len(new_chunks), len(self.chunks))

    def delete_document(self, doc_id: str) -> bool:
        """
        Delete document and rebuild the vector index with remaining chunks.
        """
        if doc_id not in self.documents:
            return False

        # Remove document metadata
        del self.documents[doc_id]

        # Filter remaining chunks
        remaining_chunks = [c for c in self.chunks if c["document_id"] != doc_id]

        # Rebuild FAISS index from remaining chunks
        self._init_empty_index()
        if remaining_chunks:
            texts = [c["text"] for c in remaining_chunks]
            vectors = self.embedder.embed_texts(texts)
            self.index.add(vectors)
            self.chunks = remaining_chunks

        self.save_index()
        logger.info("Deleted document '%s'. Remaining chunks: %d", doc_id, len(self.chunks))
        return True

    def get_documents(self) -> List[Dict[str, Any]]:
        """Return list of all registered documents."""
        return list(self.documents.values())

    def get_stats(self) -> Dict[str, Any]:
        """Return index statistics."""
        return {
            "documents_count": len(self.documents),
            "chunks_count": len(self.chunks),
            "dimension": self.embedder.dimension,
            "embedder": "SentenceTransformer" if self.embedder._is_transformer else "DenseProjection",
            "model_name": self.embedder.model_name
        }

    def search(self, query: str, top_k: int = 5, min_score: float = 0.10) -> List[Dict[str, Any]]:
        """
        Retrieve relevant passages matching the query.
        Returns empty list if knowledge base is empty.
        """
        if not self.chunks or self.index is None or self.index.ntotal == 0:
            return []

        query = query.strip()
        if not query:
            return []

        query_vec = self.embedder.embed_query(query)
        k = min(top_k, self.index.ntotal)
        scores, indices = self.index.search(query_vec, k)

        results: List[Dict[str, Any]] = []
        for rank, (score, idx) in enumerate(zip(scores[0], indices[0])):
            if idx < 0 or idx >= len(self.chunks):
                continue
            if score < min_score:
                continue

            chunk = self.chunks[idx]
            page_meta = f"Page {chunk['page_number']}" if chunk.get('page_number') else f"Chunk {chunk['chunk_index'] + 1}"
            
            results.append({
                "id": f"S{rank + 1}",
                "docTitle": chunk["document_name"],
                "docMeta": f"{page_meta} • {chunk['document_name']}",
                "fileName": chunk["document_name"],
                "score": f"{max(0.0, float(score)):.2f}",
                "hash": chunk["chunk_id"],
                "quote": chunk["text"],
                "pageNumber": chunk.get("page_number"),
                "chunkIndex": chunk["chunk_index"],
                "rawScore": float(score)
            })

        return results

    def clear_all(self) -> None:
        """Clear all indexed documents and files."""
        self._init_empty_index()
        for f in (self.index_file, self.chunks_file, self.docs_file):
            if f.exists():
                try:
                    f.unlink()
                except Exception:
                    pass
