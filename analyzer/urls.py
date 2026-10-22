from django.urls import path
from .views import (
    HealthView,
    DocumentUploadView,
    DocumentListView,
    DocumentDeleteView,
    AnalyzeView
)

urlpatterns = [
    path('health/', HealthView.as_view(), name='health'),
    path('documents/upload/', DocumentUploadView.as_view(), name='document_upload'),
    path('documents/', DocumentListView.as_view(), name='document_list'),
    path('documents/<str:doc_id>/', DocumentDeleteView.as_view(), name='document_delete'),
    path('analyze/', AnalyzeView.as_view(), name='analyze'),
]
