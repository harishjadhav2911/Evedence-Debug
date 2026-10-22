from django.apps import AppConfig

class AnalyzerConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'analyzer'
    verbose_name = 'EvidenceDebug Code Intelligence & RAG Engine'

    def ready(self):
        # Initialize RAG index on startup if storage exists
        try:
            from .rag_service import RAGService
            RAGService.get_instance().load_index()
        except Exception as e:
            # Avoid crashing during migrations or setup
            pass
