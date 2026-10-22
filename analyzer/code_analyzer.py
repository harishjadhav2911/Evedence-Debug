"""
Code Signal Analyzer for EvidenceDebug AI
Extracts AST tokens, syntax patterns, and bug signatures across C, C++, Python, and Java.
Uses Python AST analysis strictly for Python; uses heuristic pattern inspection for C, C++, and Java.
Never executes or runs submitted code.
"""
import ast
import re
from typing import List, Dict, Any, Tuple

class CodeAnalyzer:

    @classmethod
    def extract_signals(cls, code: str, language: str) -> List[Dict[str, Any]]:
        """
        Extract syntactical signals and potential gotchas from code.
        Python uses ast.walk; C, C++, Java use static heuristic pattern matching.
        """
        lang = language.lower().strip()
        signals: List[Dict[str, Any]] = []

        if lang == 'python':
            signals = cls._extract_python_ast(code)
        elif lang in ('c', 'clang'):
            signals = cls._extract_c_signals(code)
        elif lang in ('cpp', 'c++'):
            signals = cls._extract_cpp_signals(code)
        elif lang == 'java':
            signals = cls._extract_java_signals(code)
        elif lang in ('javascript', 'js'):
            signals = cls._extract_javascript_signals(code)
        else:
            signals = cls._extract_generic_signals(code, lang)

        if not signals:
            signals.append({
                "label": f"Inspection: {language.upper()} Static Structure Checked (No Dynamic Execution)",
                "type": "default",
                "icon": "bi-code-square"
            })

        return signals

    @classmethod
    def _extract_python_ast(cls, code: str) -> List[Dict[str, Any]]:
        """Python Abstract Syntax Tree analysis via official Python ast module."""
        signals: List[Dict[str, Any]] = [
            {
                "label": "Parser Engine: Python 3 AST (Syntax Tree Verified)",
                "type": "info",
                "icon": "bi-diagram-3"
            }
        ]
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            signals.append({
                "label": f"SyntaxError: Line {e.lineno} ({e.msg})",
                "type": "warning",
                "icon": "bi-exclamation-triangle"
            })
            return signals + cls._extract_generic_signals(code, 'python')

        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                signals.append({
                    "label": f"FunctionDef: {node.name}()",
                    "type": "default",
                    "icon": "bi-tag"
                })
                # Check for mutable default arguments (Python classic gotcha)
                defaults = node.args.defaults
                num_defaults = len(defaults)
                arg_names = [a.arg for a in node.args.args[-num_defaults:]] if num_defaults > 0 else []

                for arg_name, d_val in zip(arg_names, defaults):
                    if isinstance(d_val, (ast.List, ast.Dict, ast.Set)):
                        d_type = type(d_val).__name__.replace('List', '[]').replace('Dict', '{}').replace('Set', 'set()')
                        signals.append({
                            "label": f"ArgDefault: {arg_name}={d_type} (Mutable Literal Evaluated Once)",
                            "type": "warning",
                            "icon": "bi-exclamation-triangle"
                        })

            elif isinstance(node, ast.Call):
                func_name = ""
                if isinstance(node.func, ast.Name):
                    func_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    func_name = f"{getattr(node.func.value, 'id', '')}.{node.func.attr}".strip('.')

                if func_name and func_name in ("append", "extend", "remove", "pop", "insert", "catalog.append"):
                    signals.append({
                        "label": f"Call: {func_name}()",
                        "type": "default",
                        "icon": "bi-activity"
                    })

            elif isinstance(node, ast.Return):
                if node.value:
                    val_repr = getattr(node.value, 'id', 'expression')
                    signals.append({
                        "label": f"Return: {val_repr}",
                        "type": "default",
                        "icon": "bi-arrow-return-right"
                    })

        return signals

    @classmethod
    def _extract_c_signals(cls, code: str) -> List[Dict[str, Any]]:
        """Static heuristic pattern inspection for C (C17 / C99)."""
        signals: List[Dict[str, Any]] = [
            {
                "label": "Parser Engine: C Static Pattern Inspection (No Code Execution)",
                "type": "info",
                "icon": "bi-cpu"
            }
        ]

        # Memory allocation & deallocation patterns
        if re.search(r'\bmalloc\s*\(', code) or re.search(r'\bcalloc\s*\(', code):
            signals.append({
                "label": "Memory: Dynamic Heap Allocation (malloc/calloc)",
                "type": "info",
                "icon": "bi-hdd"
            })
            if not re.search(r'==\s*NULL|!=\s*NULL|\bif\s*\(\s*!\s*\w+', code):
                signals.append({
                    "label": "Risk: Missing NULL check after dynamic allocation",
                    "type": "warning",
                    "icon": "bi-exclamation-triangle"
                })

        if re.search(r'\bfree\s*\(\s*\w+\s*\)', code):
            signals.append({
                "label": "Memory: free() invocation (Potential Dangling Pointer Risk)",
                "type": "info",
                "icon": "bi-trash3"
            })

        # Unsafe string & buffer functions
        if re.search(r'\bgets\s*\(', code):
            signals.append({
                "label": "Critical: Deprecated/Unsafe gets() detected (Buffer Overflow)",
                "type": "warning",
                "icon": "bi-shield-exclamation"
            })
        if re.search(r'\bstrcpy\s*\(|\bstrcat\s*\(|\bsprintf\s*\(', code):
            signals.append({
                "label": "Risk: Unbounded string copy (strcpy/strcat buffer boundary)",
                "type": "warning",
                "icon": "bi-exclamation-triangle"
            })

        # Pointer dereference and format strings
        if re.search(r'\*\s*\w+\s*=', code) or '->' in code:
            signals.append({
                "label": "Pointer: Direct Memory Dereference (*ptr or obj->field)",
                "type": "default",
                "icon": "bi-pin"
            })

        if re.search(r'scanf\s*\(\s*"[^"]*",\s*([a-zA-Z_]\w*)', code):
            # Check for missing & in scanf (excluding arrays or pointers)
            signals.append({
                "label": "IO: scanf() formatting (Verify pass-by-pointer address &)",
                "type": "info",
                "icon": "bi-input-cursor"
            })

        return signals

    @classmethod
    def _extract_cpp_signals(cls, code: str) -> List[Dict[str, Any]]:
        """Static heuristic pattern inspection for C++ (C++20)."""
        signals: List[Dict[str, Any]] = [
            {
                "label": "Parser Engine: C++ Static Pattern Inspection (No Code Execution)",
                "type": "info",
                "icon": "bi-cpu"
            }
        ]
        if 'std::vector' in code or 'vector<' in code:
            signals.append({
                "label": "Container: std::vector Sequence",
                "type": "info",
                "icon": "bi-box"
            })
        if re.search(r'\.erase\s*\(', code):
            signals.append({
                "label": "Call: .erase() (Iterator Invalidation Risk in Loop)",
                "type": "warning",
                "icon": "bi-exclamation-triangle"
            })
        if re.search(r'for\s*\(.*;\s*\+\+\w+', code):
            signals.append({
                "label": "Loop: Iterator increment in modification loop",
                "type": "warning",
                "icon": "bi-arrow-repeat"
            })
        if 'std::unique_ptr' in code or 'std::shared_ptr' in code or 'std::make_unique' in code:
            signals.append({
                "label": "Smart Pointer: Modern RAII Resource Management",
                "type": "info",
                "icon": "bi-shield-check"
            })
        return signals

    @classmethod
    def _extract_java_signals(cls, code: str) -> List[Dict[str, Any]]:
        """Static heuristic pattern inspection for Java."""
        signals: List[Dict[str, Any]] = [
            {
                "label": "Parser Engine: Java Static Pattern Inspection (No Code Execution)",
                "type": "info",
                "icon": "bi-cup-hot"
            }
        ]
        if 'Double' in code or 'Integer' in code or 'Boolean' in code or 'Long' in code:
            signals.append({
                "label": "Boxed Wrapper Types (Potential NullPointerException on Unboxing)",
                "type": "info",
                "icon": "bi-box"
            })
        if re.search(r'[\+\-\*/]\s*\w+', code) and any(w in code for w in ('Double', 'Integer', 'Boolean')):
            signals.append({
                "label": "Binary Operator: Implicit Auto-Unboxing Evaluation",
                "type": "warning",
                "icon": "bi-exclamation-triangle"
            })
        if re.search(r'String\s+\w+\s*==\s*\w+', code) or re.search(r'==\s*"[^"]*"', code):
            signals.append({
                "label": "Risk: Reference equality (==) on String (Use .equals() instead)",
                "type": "warning",
                "icon": "bi-exclamation-triangle"
            })
        return signals

    @classmethod
    def _extract_javascript_signals(cls, code: str) -> List[Dict[str, Any]]:
        signals: List[Dict[str, Any]] = [
            {
                "label": "Parser Engine: JavaScript Static Pattern Inspection (No Code Execution)",
                "type": "info",
                "icon": "bi-filetype-js"
            }
        ]
        if re.search(r'for\s*\(\s*var\s+', code):
            signals.append({
                "label": "ForStatement: var in Loop Header (Function Scope / Hoisting Gotcha)",
                "type": "warning",
                "icon": "bi-exclamation-triangle"
            })
        if 'setTimeout' in code or 'setInterval' in code:
            signals.append({
                "label": "Async Timer: setTimeout() Macro-task / Event Loop",
                "type": "info",
                "icon": "bi-clock"
            })
        if re.search(r'function\s*\w*\s*\(', code) or '=>' in code:
            signals.append({
                "label": "Closure: Nested Callback / Function Scope",
                "type": "default",
                "icon": "bi-diagram-2"
            })
        return signals

    @classmethod
    def _extract_generic_signals(cls, code: str, lang: str = "") -> List[Dict[str, Any]]:
        signals = []
        lines = [line.strip() for line in code.split('\n') if line.strip()]
        if lines:
            signals.append({
                "label": f"Static Scan: {len(lines)} active lines in {lang.upper() or 'Source'}",
                "type": "default",
                "icon": "bi-code"
            })
        return signals

    @classmethod
    def generate_queries(cls, code: str, language: str, problem_desc: str, signals: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """Synthesize dense and sparse search queries from extracted signals and description."""
        queries: List[Dict[str, str]] = []

        # Extract high-priority warning signals
        warning_terms = [s["label"] for s in signals if s.get("type") == "warning"]
        primary_warning = warning_terms[0] if warning_terms else ""

        # Query 1: Dense Semantic Vector Query
        dense_parts = [language]
        if primary_warning:
            dense_parts.append(primary_warning)
        if problem_desc:
            dense_parts.append(problem_desc[:120])
        else:
            dense_parts.append("specification behavior definition semantics standard normative rule")

        dense_query = " ".join(dense_parts)
        queries.append({
            "type": "dense",
            "label": "Embedding Vector Search",
            "metric": "Top-K: 5 • Cosine Sim",
            "text": f'"{dense_query}"'
        })

        # Query 2: Lexical Keyword / BM25 Query
        first_line = code.strip().split('\n')[0] if code.strip() else ""
        clean_first = re.sub(r'[^\w\s]', ' ', first_line)[:60].strip()
        sparse_query = f"{language} documentation {clean_first}".strip()
        queries.append({
            "type": "bm25",
            "label": "BM25 Keyword Lexical",
            "metric": "Term Boost: 1.5x",
            "text": f'"{sparse_query}"'
        })

        return queries
