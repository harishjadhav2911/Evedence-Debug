from django.urls import path, include
from django.http import HttpResponse, FileResponse
from django.conf import settings
import os

def serve_index(request):
    """Serve the single page application HTML."""
    index_path = os.path.join(settings.BASE_DIR, 'index.html')
    with open(index_path, 'r', encoding='utf-8') as f:
        content = f.read()
    return HttpResponse(content, content_type='text/html')

def serve_styles(request):
    """Serve styles.css directly from root."""
    css_path = os.path.join(settings.BASE_DIR, 'styles.css')
    return FileResponse(open(css_path, 'rb'), content_type='text/css')

def serve_script(request):
    """Serve script.js directly from root."""
    js_path = os.path.join(settings.BASE_DIR, 'script.js')
    return FileResponse(open(js_path, 'rb'), content_type='application/javascript')

urlpatterns = [
    path('api/v1/', include('analyzer.urls')),
    path('', serve_index, name='index'),
    path('styles.css', serve_styles, name='styles'),
    path('script.js', serve_script, name='script'),
]
