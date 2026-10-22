"""
Document Processor for EvidenceDebug AI
Extracts, cleans, and chunks PDF, TXT, and Markdown files with metadata preservation.
"""
import uuid
import re
from typing import List, Dict, Tuple, Any
from pypdf import PdfReader
from django.conf import settings

class DocumentProcessor:
    ALLOWED_EXTENSIONS = {'.pdf', '.txt', '.md'}
    CHUNK_SIZE = 700  # characters per chunk
    CHUNK_OVERLAP = 120  # character overlap between contiguous chunks

    @classmethod
    def validate_file(cls, uploaded_file) -> None:
        """Validate file size and allowed extension."""
        if not uploaded_file:
            raise ValueError("No file was provided.")

        filename = uploaded_file.name
        ext = '.' + filename.split('.')[-1].lower() if '.' in filename else ''
        if ext not in cls.ALLOWED_EXTENSIONS:
            raise ValueError(
                f"Unsupported file format '{ext}'. Allowed formats are: {', '.join(sorted(cls.ALLOWED_EXTENSIONS))}"
            )

        max_bytes = getattr(settings, 'MAX_UPLOAD_SIZE_MB', 25) * 1024 * 1024
        if uploaded_file.size > max_bytes:
            raise ValueError(
                f"File '{filename}' exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB}MB."
            )

    @classmethod
    def extract_and_chunk(cls, file_obj, filename: str) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """
        Extract text from file and split into overlapping chunks with metadata.
        Returns (document_metadata, list_of_chunks).
        """
        doc_id = str(uuid.uuid4())
        ext = '.' + filename.split('.')[-1].lower() if '.' in filename else ''
        
        chunks: List[Dict[str, Any]] = []
        total_text_length = 0
        page_count = None

        if ext == '.pdf':
            chunks, total_text_length, page_count = cls._process_pdf(file_obj, doc_id, filename)
        else:
            chunks, total_text_length = cls._process_text_file(file_obj, doc_id, filename)

        if not chunks or total_text_length == 0:
            raise ValueError(f"Document '{filename}' contains no extractable text or is empty.")

        metadata = {
            "id": doc_id,
            "filename": filename,
            "file_size": file_obj.size if hasattr(file_obj, 'size') else len(file_obj.read()),
            "extension": ext,
            "page_count": page_count,
            "chunks_count": len(chunks),
            "total_chars": total_text_length
        }

        return metadata, chunks

    @classmethod
    def _process_pdf(cls, file_obj, doc_id: str, filename: str) -> Tuple[List[Dict[str, Any]], int, int]:
        """Process PDF document page by page preserving page numbers."""
        try:
            reader = PdfReader(file_obj)
        except Exception as e:
            raise ValueError(f"Failed to parse PDF file '{filename}': {str(e)}")

        num_pages = len(reader.pages)
        if num_pages == 0:
            raise ValueError(f"PDF document '{filename}' has no pages.")

        all_chunks: List[Dict[str, Any]] = []
        total_chars = 0
        chunk_idx = 0

        for page_idx, page in enumerate(reader.pages):
            page_num = page_idx + 1
            try:
                page_text = page.extract_text() or ""
            except Exception:
                page_text = ""

            page_text = cls._clean_text(page_text)
            if not page_text:
                continue

            total_chars += len(page_text)
            page_chunks = cls._split_into_chunks(page_text)

            for p_chunk in page_chunks:
                all_chunks.append({
                    "chunk_id": f"{doc_id}_p{page_num}_c{chunk_idx}",
                    "document_id": doc_id,
                    "document_name": filename,
                    "page_number": page_num,
                    "chunk_index": chunk_idx,
                    "text": p_chunk
                })
                chunk_idx += 1

        return all_chunks, total_chars, num_pages

    @classmethod
    def _process_text_file(cls, file_obj, doc_id: str, filename: str) -> Tuple[List[Dict[str, Any]], int]:
        """Process plain text or markdown file."""
        content_bytes = file_obj.read()
        try:
            text = content_bytes.decode('utf-8')
        except UnicodeDecodeError:
            try:
                text = content_bytes.decode('latin-1')
            except Exception as e:
                raise ValueError(f"Failed to decode text file '{filename}': {str(e)}")

        text = cls._clean_text(text)
        total_chars = len(text)
        if total_chars == 0:
            return [], 0

        raw_chunks = cls._split_into_chunks(text)
        all_chunks: List[Dict[str, Any]] = []

        for idx, chunk_text in enumerate(raw_chunks):
            all_chunks.append({
                "chunk_id": f"{doc_id}_c{idx}",
                "document_id": doc_id,
                "document_name": filename,
                "page_number": None,
                "chunk_index": idx,
                "text": chunk_text
            })

        return all_chunks, total_chars

    @classmethod
    def _split_into_chunks(cls, text: str) -> List[str]:
        """Split text into overlapping character windows, preferring sentence boundaries."""
        if len(text) <= cls.CHUNK_SIZE:
            return [text]

        chunks = []
        start = 0
        text_len = len(text)

        while start < text_len:
            end = min(start + cls.CHUNK_SIZE, text_len)
            
            # If not at the end of the text, try to break at a sentence or newline boundary
            if end < text_len:
                break_point = max(
                    text.rfind('. ', start + cls.CHUNK_SIZE // 2, end),
                    text.rfind('\n', start + cls.CHUNK_SIZE // 2, end),
                    text.rfind('; ', start + cls.CHUNK_SIZE // 2, end)
                )
                if break_point != -1 and break_point > start:
                    end = break_point + 1

            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)

            # Advance by step (size - overlap)
            step = max(100, (end - start) - cls.CHUNK_OVERLAP)
            start += step

        return chunks

    @staticmethod
    def _clean_text(text: str) -> str:
        """Normalize whitespace and control characters."""
        if not text:
            return ""
        # Replace non-breaking spaces and excessive whitespace
        text = text.replace('\xa0', ' ')
        text = re.sub(r'[ \t]+', ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()
