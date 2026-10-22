/**
 * ============================================================================
 * EvidenceDebug AI — Frontend Controller & RAG Simulation Logic
 * ============================================================================
 * 
 * ARCHITECTURE & FUTURE DJANGO API INTEGRATION POINTS:
 * ----------------------------------------------------------------------------
 * 1. Code Analysis & Grounding:
 *    ENDPOINT: POST /api/v1/analyze/
 *    PAYLOAD:  { code: string, language: string, problem_description: string }
 *    RESPONSE: { 
 *       task_id: string, 
 *       ast_signals: Array<{ name: string, type: string, line: number }>,
 *       queries: Array<{ type: string, query: string, metric: string }>,
 *       passages: Array<{ id: string, doc: string, section: string, score: number, quote: string }>,
 *       explanation: { root_cause: string, grounded_claims: Array<object> },
 *       issues: Array<object>,
 *       fixed_code: string 
 *    }
 * 
 * 2. Document Corpus & Vector Indexing:
 *    ENDPOINT: POST /api/v1/documents/upload/ (multipart/form-data)
 *    ENDPOINT: GET  /api/v1/documents/
 * 
 * 3. Session History:
 *    ENDPOINT: GET  /api/v1/history/
 *    ENDPOINT: POST /api/v1/history/save/
 * ----------------------------------------------------------------------------
 */

(function () {
  'use strict';

  // ==========================================================================
  // SCENARIO REPOSITORY (DEMO DATA)
  // Realistic bugs across multiple languages with grounded doc passages
  // ==========================================================================
  const DEMO_SCENARIOS = {
    'python-default-arg': {
      language: 'python',
      filename: 'buggy_accumulator.py',
      fixedFilename: 'fixed_accumulator.py',
      code: `def append_item(item, catalog=[]):
    """
    Append an item to the shopping catalog.
    Bug: Mutable default argument persists across invocations.
    """
    catalog.append(item)
    return catalog

# Test calls:
print(append_item("Mechanical Keyboard"))
print(append_item("Ergonomic Mouse"))  # Unexpectedly retains previous item!`,
      problemDescription: 'Items from previous function calls are leaking into new calls when the catalog argument is omitted.',
      corpusName: 'Python 3.12 Spec & Core Reference',
      signals: [
        { label: 'FunctionDef: append_item', type: 'default', icon: 'bi-tag' },
        { label: 'ArgDefault: catalog=[] (ListLiteral)', type: 'warning', icon: 'bi-exclamation-triangle' },
        { label: 'Call: catalog.append()', type: 'default', icon: 'bi-activity' },
        { label: 'Return: catalog', type: 'default', icon: 'bi-arrow-return-right' },
        { label: 'Scope: Module-level Function', type: 'info', icon: 'bi-code' }
      ],
      queries: [
        {
          type: 'dense',
          label: 'Embedding Vector Search',
          metric: 'Top-K: 5 • Cosine Sim',
          text: '"python function definition mutable default argument list state retention"'
        },
        {
          type: 'bm25',
          label: 'BM25 Keyword Lexical',
          metric: 'Term Boost: 1.8x',
          text: '"Python 3.12 documentation \'default parameter values\' \'evaluated once\'"'
        }
      ],
      passages: [
        {
          id: 'S1',
          docTitle: 'Python 3.12 Official Reference Manual',
          docMeta: 'Section 8.6 • Function Definitions • Page 142',
          fileName: 'python_3.12_reference.pdf',
          score: '0.94',
          hash: 'chunk_py312_sec86_042',
          quote: 'Default parameter values are evaluated from left to right when the function definition is executed. This means that the expression is <mark class="text-highlight">evaluated once, when the function is defined</mark>, and that the same ‘pre-computed’ value is used for each call. This is especially important to understand when a default parameter is a <mark class="text-highlight">mutable object, such as a list</mark> or a dictionary.'
        },
        {
          id: 'S2',
          docTitle: 'Python Architecture & Common Gotchas',
          docMeta: 'Chapter 3 • Default Argument Mutability • Page 28',
          fileName: 'gotchas_and_idioms.txt',
          score: '0.88',
          hash: 'chunk_gotchas_ch3_014',
          quote: 'A common idiom to prevent accidental state retention between function calls is to use <mark class="text-highlight"><code>None</code> as the default value</mark>, and explicitly check inside the body: <code>if arg is None: arg = []</code>. This ensures a fresh instance is constructed on each invocation.'
        }
      ],
      explanation: {
        confidence: '94% Evidence Grounded (Demo)',
        paragraphs: [
          'In Python, default argument values are evaluated <strong>once when the function definition is executed</strong>, not each time the function is invoked <span class="claim-badge badge-doc-backed ms-1">DOC-BACKED</span> <a href="#passage-s1" class="citation-link" data-citation="s1">[S1]</a>.',
          'Because a mutable list literal <code>catalog=[]</code> was assigned in the parameter signature, that single list instance is bound to the function\'s internal <code>__defaults__</code> tuple. Consecutive calls that omit the second argument mutate the exact same object in memory, retaining items from earlier calls <span class="claim-badge badge-doc-backed ms-1">DOC-BACKED</span> <a href="#passage-s2" class="citation-link" data-citation="s2">[S2]</a>.',
          'This behavior is a deliberate design choice in the Python language specification, but it frequently leads to subtle state-leak bugs when functions are assumed to generate a new list per execution <span class="claim-badge badge-general-knowledge ms-1">GENERAL KNOWLEDGE</span>.'
        ],
        timeline: [
          {
            title: 'Definition Phase (Module Load):',
            desc: 'Python evaluates <code>catalog=[]</code> once. An empty list object is created at a memory address (e.g., <code>0x7f9a1</code>) and placed in <code>append_item.__defaults__</code>.'
          },
          {
            title: 'First Invocation (append_item("Mechanical Keyboard")):',
            desc: 'No second parameter is provided. Python points the local variable <code>catalog</code> to <code>0x7f9a1</code>. Calling <code>.append()</code> mutates it to <code>[\'Mechanical Keyboard\']</code>.'
          },
          {
            title: 'Second Invocation (append_item("Ergonomic Mouse")):',
            desc: 'Again, no second parameter is provided. Python reuses <code>0x7f9a1</code>, which still holds the previous item. Appending results in <code>[\'Mechanical Keyboard\', \'Ergonomic Mouse\']</code>.'
          }
        ],
        tableRows: [
          { ref: '#C1', claim: 'Defaults evaluated once at definition', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S1] Section 8.6', sourceId: 's1' },
          { ref: '#C2', claim: 'Use None sentinel to prevent state retention', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S2] Chapter 3', sourceId: 's2' },
          { ref: '#C3', claim: 'Function parameter syntax rules', badge: 'GENERAL', badgeClass: 'badge-general-knowledge', source: 'Python Spec', sourceId: '' }
        ]
      },
      issues: [
        {
          severity: 'HIGH',
          severityClass: 'severity-high',
          location: 'Line 1 • def append_item(...)',
          grounding: 'DOC-BACKED [S1]',
          title: 'Mutable Default Parameter (catalog=[])',
          description: 'Default parameter catalog is initialized to a mutable list literal []. This default object persists across function invocations, accumulating state between calls.',
          diffMinus: 'def append_item(item, catalog=[]):',
          diffPlus: 'def append_item(item, catalog=None):',
          rule: 'W0102 (dangerous-default-value)',
          sourceId: 's1'
        }
      ],
      fixedCode: `def append_item(item, catalog=None):
    """
    Append an item to the shopping catalog.
    
    Fixed: Uses None sentinel default to prevent cross-call state mutation.
    Grounded in: Python 3.12 Reference Manual [S1] & Gotchas [S2].
    """
    if catalog is None:
        catalog = []
    
    catalog.append(item)
    return catalog

# Verification test calls:
print(append_item("Mechanical Keyboard"))  # Output: ['Mechanical Keyboard']
print(append_item("Ergonomic Mouse"))      # Output: ['Ergonomic Mouse'] (Fresh list!)
print(append_item("USB Hub", ["Monitor"])) # Output: ['Monitor', 'USB Hub'] (Explicit argument respected)`
    },

    'js-closure-async': {
      language: 'javascript',
      filename: 'async_event_loop.js',
      fixedFilename: 'fixed_event_loop.js',
      code: `function scheduleTaskPrints() {
    // Bug: 'var' declaration creates function-scoped binding
    for (var i = 0; i < 3; i++) {
        setTimeout(function() {
            console.log("Processing task index:", i);
        }, 100);
    }
}

scheduleTaskPrints(); // Expected: 0, 1, 2. Actual: 3, 3, 3`,
      problemDescription: 'setTimeout logs "3" three times instead of printing 0, 1, and 2 in sequence.',
      corpusName: 'ECMAScript 2022 Spec & V8 Runtime Docs',
      signals: [
        { label: 'ForStatement: var i = 0', type: 'warning', icon: 'bi-exclamation-triangle' },
        { label: 'Closure: function() inside setTimeout', type: 'default', icon: 'bi-diagram-2' },
        { label: 'Async Timer: setTimeout(..., 100)', type: 'info', icon: 'bi-clock' },
        { label: 'VariableDeclaration: var (Function Scoped)', type: 'warning', icon: 'bi-tag' }
      ],
      queries: [
        {
          type: 'dense',
          label: 'Embedding Vector Search',
          metric: 'Top-K: 4 • Cosine Sim',
          text: '"javascript for loop var setTimeout closure shared lexical environment"'
        },
        {
          type: 'bm25',
          label: 'BM25 Keyword Lexical',
          metric: 'Term Boost: 1.5x',
          text: '"ECMA-262 BlockDeclarationInstantiation for loop lexical binding let vs var"'
        }
      ],
      passages: [
        {
          id: 'S1',
          docTitle: 'ECMA-262 Specification (13.7.4 For Statement)',
          docMeta: 'Section 13.7.4.8 • LexicalDeclaration in Loop Headers',
          fileName: 'ecma262_spec.pdf',
          score: '0.96',
          hash: 'chunk_ecma262_sec1374',
          quote: 'When <code>var</code> is used in a loop header, only a <mark class="text-highlight">single variable binding is allocated</mark> for the entire enclosing execution context. In contrast, <code>let</code> declarations create a <mark class="text-highlight">fresh lexical environment per iteration</mark>, capturing the specific value of the counter for every inner closure.'
        },
        {
          id: 'S2',
          docTitle: 'JavaScript Event Loop & Concurrency Model',
          docMeta: 'Chapter 2 • Asynchronous Timers & Macro-tasks',
          fileName: 'js_concurrency_guide.txt',
          score: '0.91',
          hash: 'chunk_js_concurrency_02',
          quote: 'Callbacks passed to <code>setTimeout</code> are pushed to the Macrotask Queue and execute only after the call stack clears. By the time any callback executes, the synchronous <code>for</code> loop has terminated, leaving <code>i = 3</code>.'
        }
      ],
      explanation: {
        confidence: '95% Evidence Grounded (Demo)',
        paragraphs: [
          'In JavaScript, declaring a loop variable with <code>var</code> binds it to the function scope rather than the block scope <span class="claim-badge badge-doc-backed ms-1">DOC-BACKED</span> <a href="#passage-s1" class="citation-link" data-citation="s1">[S1]</a>.',
          'Because <code>setTimeout</code> is asynchronous, its callbacks are queued and execute after the synchronous loop finishes. By that time, <code>i</code> has incremented to <code>3</code>, and all closures refer to the identical variable binding <span class="claim-badge badge-doc-backed ms-1">DOC-BACKED</span> <a href="#passage-s2" class="citation-link" data-citation="s2">[S2]</a>.',
          'Replacing <code>var</code> with block-scoped <code>let</code> creates a distinct lexical binding for each loop iteration, preserving individual counter values <span class="claim-badge badge-general-knowledge ms-1">GENERAL KNOWLEDGE</span>.'
        ],
        timeline: [
          {
            title: 'Loop Execution (Synchronous):',
            desc: 'The loop executes 3 times synchronously, queuing three timer callbacks. The single <code>var i</code> variable increments to 3.'
          },
          {
            title: 'Timer Expiry (100ms later):',
            desc: 'The three callbacks are dequeued from the task queue onto the call stack.'
          },
          {
            title: 'Callback Execution:',
            desc: 'Each callback accesses the shared <code>i</code> binding, which currently holds the terminal value <code>3</code>.'
          }
        ],
        tableRows: [
          { ref: '#C1', claim: 'var creates single function-scoped variable binding', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S1] Sec 13.7.4', sourceId: 's1' },
          { ref: '#C2', claim: 'setTimeout callbacks execute after synchronous stack empties', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S2] Chapter 2', sourceId: 's2' },
          { ref: '#C3', claim: 'let keyword provides per-iteration block scope binding', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S1] Sec 13.7.4', sourceId: 's1' }
        ]
      },
      issues: [
        {
          severity: 'HIGH',
          severityClass: 'severity-high',
          location: 'Line 3 • for (var i = 0; ...)',
          grounding: 'DOC-BACKED [S1, S2]',
          title: 'Loop Closure over Function-Scoped "var"',
          description: 'Asynchronous callbacks capture a mutable var binding across loop iterations instead of an immutable per-iteration state.',
          diffMinus: 'for (var i = 0; i < 3; i++) {',
          diffPlus: 'for (let i = 0; i < 3; i++) {',
          rule: 'no-loop-func (ESLint)',
          sourceId: 's1'
        }
      ],
      fixedCode: `function scheduleTaskPrints() {
    // Fixed: 'let' creates a new lexical binding per loop iteration
    // Grounded in ECMA-262 Specification Section 13.7.4 [S1]
    for (let i = 0; i < 3; i++) {
        setTimeout(function() {
            console.log("Processing task index:", i);
        }, 100);
    }
}

scheduleTaskPrints(); // Correct Output: 0, 1, 2`
    },

    'cpp-iterator-invalidation': {
      language: 'cpp',
      filename: 'vector_invalidation.cpp',
      fixedFilename: 'fixed_vector_erase.cpp',
      code: `#include <iostream>
#include <vector>

void remove_evens(std::vector<int>& vec) {
    // Bug: erase() invalidates current iterator; increment causes undefined behavior
    for (auto it = vec.begin(); it != vec.end(); ++it) {
        if (*it % 2 == 0) {
            vec.erase(it); // Danger: invalidates 'it'
        }
    }
}

int main() {
    std::vector<int> numbers = {1, 2, 4, 5, 6};
    remove_evens(numbers);
    return 0;
}`,
      problemDescription: 'Erasing elements while looping crashes with a segmentation fault or skips adjacent even numbers.',
      corpusName: 'ISO C++ Standard (ISO/IEC 14882) & STL Spec',
      signals: [
        { label: 'Function: remove_evens', type: 'default', icon: 'bi-tag' },
        { label: 'Container: std::vector<int>', type: 'info', icon: 'bi-box' },
        { label: 'Call: vec.erase(it) in loop', type: 'warning', icon: 'bi-exclamation-triangle' },
        { label: 'Loop Step: ++it after invalidation', type: 'warning', icon: 'bi-radioactive' }
      ],
      queries: [
        {
          type: 'dense',
          label: 'Embedding Vector Search',
          metric: 'Top-K: 4 • Cosine Sim',
          text: '"std::vector erase iterator invalidation loop undefined behavior"'
        },
        {
          type: 'bm25',
          label: 'BM25 Keyword Lexical',
          metric: 'Term Boost: 2.0x',
          text: '"C++ standard [vector.modifiers] erase return value"'
        }
      ],
      passages: [
        {
          id: 'S1',
          docTitle: 'ISO/IEC 14882 C++ Standard Library Specification',
          docMeta: 'Clause 23.3.11.5 [vector.modifiers]',
          fileName: 'cpp_iso_14882_containers.pdf',
          score: '0.97',
          hash: 'chunk_cpp_iso_sec23',
          quote: 'The member function <code>erase(iterator position)</code> <mark class="text-highlight">invalidates iterators and references at or after the point of the erase</mark>. It returns an iterator pointing to the new location of the element that followed the last element erased.'
        },
        {
          id: 'S2',
          docTitle: 'Effective Modern C++ (Scott Meyers)',
          docMeta: 'Item 9 • Erase-Remove Idiom & std::erase_if',
          fileName: 'effective_modern_cpp.txt',
          score: '0.92',
          hash: 'chunk_effective_cpp_09',
          quote: 'In C++20, prefer <code>std::erase_if(container, predicate)</code> over manual iterator loops. For pre-C++20, assign the return value of <code>erase()</code> directly to the iterator rather than blindly calling <code>++it</code>.'
        }
      ],
      explanation: {
        confidence: '97% Evidence Grounded (Demo)',
        paragraphs: [
          'Calling <code>std::vector::erase(it)</code> invalidates the iterator <code>it</code> and all subsequent iterators <span class="claim-badge badge-doc-backed ms-1">DOC-BACKED</span> <a href="#passage-s1" class="citation-link" data-citation="s1">[S1]</a>.',
          'When the loop executes <code>++it</code> on the invalidated iterator in the next iteration, the program invokes <strong>Undefined Behavior</strong>, resulting in skipped elements or memory corruption <span class="claim-badge badge-doc-backed ms-1">DOC-BACKED</span> <a href="#passage-s1" class="citation-link" data-citation="s1">[S1]</a>.',
          'In modern C++20, the standardized algorithm <code>std::erase_if</code> cleanly removes matching elements with linear complexity without manual iterator arithmetic <span class="claim-badge badge-doc-backed ms-1">DOC-BACKED</span> <a href="#passage-s2" class="citation-link" data-citation="s2">[S2]</a>.'
        ],
        timeline: [
          {
            title: 'Initial Element (1):',
            desc: 'Odd number. Evaluates false, iterator advances cleanly to index 1 (value 2).'
          },
          {
            title: 'First Even Element (2):',
            desc: 'vec.erase(it) is called. The vector shifts elements [4, 5, 6] left. The memory slot of it is modified.'
          },
          {
            title: 'Loop Increment (++it):',
            desc: 'The loop executes ++it on the invalidated iterator, stepping over value 4 without inspecting it.'
          }
        ],
        tableRows: [
          { ref: '#C1', claim: 'vec.erase() invalidates all iterators at and after erase point', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S1] Clause 23.3.11.5', sourceId: 's1' },
          { ref: '#C2', claim: 'Incrementing invalidated iterator is undefined behavior', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S1] Container Requirements', sourceId: 's1' },
          { ref: '#C3', claim: 'std::erase_if provides idiomatic O(N) erasure', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S2] Item 9', sourceId: 's2' }
        ]
      },
      issues: [
        {
          severity: 'HIGH',
          severityClass: 'severity-high',
          location: 'Line 8 • vec.erase(it);',
          grounding: 'DOC-BACKED [S1]',
          title: 'Iterator Invalidation in std::vector Loop',
          description: 'Vector modification during iteration invalidates iterators. Incrementing an invalidated iterator causes crashes or undefined memory reads.',
          diffMinus: 'for (auto it = vec.begin(); it != vec.end(); ++it) { vec.erase(it); }',
          diffPlus: 'std::erase_if(vec, [](int n) { return n % 2 == 0; });',
          rule: 'C++ Core Guidelines ES.50',
          sourceId: 's1'
        }
      ],
      fixedCode: `#include <iostream>
#include <vector>
#include <algorithm> // For std::erase_if (C++20)

void remove_evens(std::vector<int>& vec) {
    // Fixed: std::erase_if handles shifting and size adjustments in O(N) time
    // Grounded in ISO C++ [vector.modifiers] [S1] & Effective C++ [S2]
    std::erase_if(vec, [](int n) { 
        return n % 2 == 0; 
    });
}

int main() {
    std::vector<int> numbers = {1, 2, 4, 5, 6};
    remove_evens(numbers);
    
    // Verified Output: 1, 5
    for (int n : numbers) {
        std::cout << n << " ";
    }
    std::cout << std::endl;
    return 0;
}`
    },

    'java-npe-unboxing': {
      language: 'java',
      filename: 'AccountSummary.java',
      fixedFilename: 'FixedAccountSummary.java',
      code: `public class AccountSummary {
    public static double computeTotal(Double baseFee, Double discount) {
        // Bug: Automatic unboxing of null Double throws NullPointerException
        return baseFee - discount;
    }

    public static void main(String[] args) {
        Double fee = 100.0;
        Double discount = null; // Unapplied promotional credit
        System.out.println("Total: " + computeTotal(fee, discount));
    }
}`,
      problemDescription: 'Throws java.lang.NullPointerException at runtime even though there is no explicit null dereference in the formula.',
      corpusName: 'The Java Language Specification (JLS 21)',
      signals: [
        { label: 'Method: computeTotal(Double, Double)', type: 'default', icon: 'bi-tag' },
        { label: 'Wrapper Types: java.lang.Double', type: 'info', icon: 'bi-box' },
        { label: 'Binary Operator: - (Subtraction)', type: 'default', icon: 'bi-plus-slash-minus' },
        { label: 'Implicit Op: .doubleValue() on null', type: 'warning', icon: 'bi-exclamation-triangle' }
      ],
      queries: [
        {
          type: 'dense',
          label: 'Embedding Vector Search',
          metric: 'Top-K: 4 • Cosine Sim',
          text: '"java unboxing null wrapper object NullPointerException binary arithmetic"'
        },
        {
          type: 'bm25',
          label: 'BM25 Keyword Lexical',
          metric: 'Term Boost: 1.6x',
          text: '"Java Language Specification 5.1.8 Unboxing Conversion NullPointerException"'
        }
      ],
      passages: [
        {
          id: 'S1',
          docTitle: 'The Java Language Specification (Java SE 21 Edition)',
          docMeta: 'Section 5.1.8 • Unboxing Conversion',
          fileName: 'jls_se21_spec.pdf',
          score: '0.98',
          hash: 'chunk_jls21_sec518',
          quote: 'If <code>r</code> is a reference of type <code>Double</code>, unboxing conversion converts <code>r</code> to <code>r.doubleValue()</code>. <mark class="text-highlight">If r is null, unboxing conversion throws a NullPointerException</mark> at runtime.'
        },
        {
          id: 'S2',
          docTitle: 'Effective Java (Joshua Bloch, 3rd Edition)',
          docMeta: 'Item 61 • Prefer Primitive Types to Boxed Primitives',
          fileName: 'effective_java_3e.txt',
          score: '0.91',
          hash: 'chunk_effective_java_item61',
          quote: 'When you mix primitives and boxed primitives in an arithmetic operation, the boxed primitive is <mark class="text-highlight">automatically unboxed</mark>. If a null reference is unboxed, you get an unavoidable <code>NullPointerException</code>. Check for null or use primitive defaults.'
        }
      ],
      explanation: {
        confidence: '98% Evidence Grounded (Demo)',
        paragraphs: [
          'In Java, binary arithmetic operators like <code>-</code> operate exclusively on primitive numeric types <span class="claim-badge badge-doc-backed ms-1">DOC-BACKED</span> <a href="#passage-s1" class="citation-link" data-citation="s1">[S1]</a>.',
          'When evaluating <code>baseFee - discount</code>, the compiler injects implicit unboxing calls: <code>baseFee.doubleValue() - discount.doubleValue()</code>. Because <code>discount</code> is <code>null</code>, attempting to invoke <code>.doubleValue()</code> throws <code>java.lang.NullPointerException</code> <span class="claim-badge badge-doc-backed ms-1">DOC-BACKED</span> <a href="#passage-s1" class="citation-link" data-citation="s1">[S1]</a>.',
          'Using primitive types or explicit null coalescing (e.g., <code>discount != null ? discount : 0.0</code>) guarantees null safety <span class="claim-badge badge-doc-backed ms-1">DOC-BACKED</span> <a href="#passage-s2" class="citation-link" data-citation="s2">[S2]</a>.'
        ],
        timeline: [
          {
            title: 'Method Entry:',
            desc: 'baseFee receives 100.0 (boxed Double); discount receives null reference.'
          },
          {
            title: 'Arithmetic Unboxing:',
            desc: 'The JVM evaluates baseFee.doubleValue() -> 100.0 successfully.'
          },
          {
            title: 'Exception Throw:',
            desc: 'The JVM evaluates discount.doubleValue(). Since discount is null, NullPointerException is thrown immediately.'
          }
        ],
        tableRows: [
          { ref: '#C1', claim: 'Unboxing null wrapper throws NullPointerException', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S1] JLS Sec 5.1.8', sourceId: 's1' },
          { ref: '#C2', claim: 'Binary arithmetic operators require primitive operands', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S1] JLS Chapter 15', sourceId: 's1' },
          { ref: '#C3', claim: 'Prefer primitive numeric types or explicit null checks', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S2] Item 61', sourceId: 's2' }
        ]
      },
      issues: [
        {
          severity: 'HIGH',
          severityClass: 'severity-high',
          location: 'Line 4 • return baseFee - discount;',
          grounding: 'DOC-BACKED [S1, S2]',
          title: 'Unboxing of Potentially Null Boxed Double',
          description: 'Implicit invocation of .doubleValue() on null Double argument discount produces runtime NullPointerException.',
          diffMinus: 'return baseFee - discount;',
          diffPlus: 'return (baseFee != null ? baseFee : 0.0) - (discount != null ? discount : 0.0);',
          rule: 'NullDereference / UnboxingNull',
          sourceId: 's1'
        }
      ],
      fixedCode: `public class AccountSummary {
    public static double computeTotal(Double baseFee, Double discount) {
        // Fixed: Explicit null-safe defaults prevent unexpected unboxing NullPointerException
        // Grounded in Java Language Specification 5.1.8 [S1] & Effective Java Item 61 [S2]
        double feeVal = (baseFee != null) ? baseFee : 0.0;
        double discountVal = (discount != null) ? discount : 0.0;
        
        return Math.max(0.0, feeVal - discountVal);
    }

    public static void main(String[] args) {
        Double fee = 100.0;
        Double discount = null; // Unapplied promotional credit
        
        // Verified Safe Output: Total: 100.0
        System.out.println("Total: " + computeTotal(fee, discount));
    }
}`
    },
    'c-buffer-overflow': {
      language: 'c',
      filename: 'unsafe_string_copy.c',
      fixedFilename: 'safe_string_copy.c',
      code: `#include <stdio.h>
#include <string.h>

void greet_user(void) {
    char username[16];
    printf("Enter username: ");
    // Bug: gets() performs no bounds checking on username buffer
    gets(username);
    printf("Welcome, %s!\\n", username);
}

int main(void) {
    greet_user();
    return 0;
}`,
      problemDescription: 'Entering more than 15 characters causes a segmentation fault or stack buffer overflow crash.',
      corpusName: 'ISO/IEC 9899 C Standard & CERT C Coding Standard',
      signals: [
        { label: 'FunctionDef: greet_user()', type: 'default', icon: 'bi-tag' },
        { label: 'Buffer: username[16] Stack Array', type: 'info', icon: 'bi-box' },
        { label: 'Call: gets() (Severe Buffer Overflow Risk)', type: 'warning', icon: 'bi-exclamation-triangle' }
      ],
      queries: [
        {
          type: 'dense',
          label: 'Embedding Vector Search',
          metric: 'Top-K: 4 • Cosine Sim',
          text: '"C language standard gets buffer overflow bounded fgets size_t"'
        },
        {
          type: 'bm25',
          label: 'BM25 Keyword Lexical',
          metric: 'Term Boost: 1.6x',
          text: '"CERT C MSC24-C Do not use deprecated or obsolescent functions gets"'
        }
      ],
      passages: [
        {
          id: 'S1',
          docTitle: 'ISO/IEC 9899 C11 Standard',
          docMeta: 'Section 7.31.2 • Removed Functions & Annex K',
          fileName: 'iso_c11_spec.pdf',
          score: '0.96',
          hash: 'chunk_c11_sec7312',
          quote: 'The gets function has been removed from the C Standard because it has no way to prevent buffer overflow. Reading past the end of the array causes undefined behavior, stack corruption, and security vulnerabilities.'
        },
        {
          id: 'S2',
          docTitle: 'SEI CERT C Coding Standard',
          docMeta: 'Rule MSC24-C • Do not use obsolescent functions',
          fileName: 'cert_c_coding_standard.txt',
          score: '0.92',
          hash: 'chunk_cert_c_msc24',
          quote: 'Never use gets(). Replace it with fgets(), passing the maximum size of the destination buffer: fgets(buf, sizeof(buf), stdin), followed by stripping any trailing newline character.'
        }
      ],
      explanation: {
        confidence: '96% Evidence Grounded (Demo)',
        paragraphs: [
          'In C, arrays allocated on the stack (like <code>char username[16]</code>) have fixed memory bounds <span class="claim-badge badge-doc-backed ms-1">DOC-BACKED</span> <a href="#passage-s1" class="citation-link" data-citation="s1">[S1]</a>.',
          'The <code>gets()</code> function reads characters until encountering a newline without receiving any buffer size parameter, writing past the allocated 16 bytes into adjacent stack frames <span class="claim-badge badge-doc-backed ms-1">DOC-BACKED</span> <a href="#passage-s1" class="citation-link" data-citation="s1">[S1]</a>.',
          'Replacing <code>gets()</code> with <code>fgets(username, sizeof(username), stdin)</code> enforces strict buffer bounds checking <span class="claim-badge badge-doc-backed ms-1">DOC-BACKED</span> <a href="#passage-s2" class="citation-link" data-citation="s2">[S2]</a>.'
        ],
        timeline: [
          { title: 'Stack Allocation:', desc: '16 bytes reserved for username buffer on the call stack.' },
          { title: 'Unbounded Read:', desc: 'gets() reads continuously into username without boundary checking.' },
          { title: 'Buffer Overflow:', desc: 'Excess bytes overwrite the saved return address, causing undefined behavior or crash.' }
        ],
        tableRows: [
          { ref: '#C1', claim: 'gets() has no buffer bound checks and is removed from modern C', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S1] ISO C11 Sec 7.31.2', sourceId: 's1' },
          { ref: '#C2', claim: 'Writing past stack buffer corrupts memory causing crashes', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S1] ISO C11 Sec 7.31.2', sourceId: 's1' },
          { ref: '#C3', claim: 'Use bounded fgets(buf, sizeof(buf), stdin) to ensure safe input', badge: 'DOC-BACKED', badgeClass: 'badge-doc-backed', source: '[S2] CERT C MSC24-C', sourceId: 's2' }
        ]
      },
      issues: [
        {
          severity: 'HIGH',
          severityClass: 'severity-high',
          location: 'Line 8 • gets(username);',
          grounding: 'DOC-BACKED [S1, S2]',
          title: 'Critical Buffer Overflow via Unbounded gets()',
          description: 'gets() does not check destination buffer capacity, causing memory corruption when input exceeds 15 bytes.',
          diffMinus: 'gets(username);',
          diffPlus: 'fgets(username, sizeof(username), stdin);',
          rule: 'CERT-C-MSC24-C / BufferOverflow',
          sourceId: 's1'
        }
      ],
      fixedCode: `#include <stdio.h>
#include <string.h>

void greet_user(void) {
    char username[16];
    printf("Enter username: ");
    
    // Fixed: Bounded read prevents buffer overflow [S1, S2]
    if (fgets(username, sizeof(username), stdin) != NULL) {
        // Strip trailing newline if present
        username[strcspn(username, "\\n")] = '\\0';
    }
    
    printf("Welcome, %s!\\n", username);
}

int main(void) {
    greet_user();
    return 0;
}`
    }
  };

  // ==========================================================================
  // DOM ELEMENT REFERENCES
  // ==========================================================================
  const elements = {
    // Top Nav & Controls
    languageSelect: document.getElementById('language-select'),
    currentFilename: document.getElementById('current-filename'),
    activeCorpusName: document.getElementById('active-corpus-name'),
    scenarioPresets: document.querySelectorAll('.preset-option'),
    navBtnWorkspace: document.getElementById('nav-btn-workspace'),
    navBtnResults: document.getElementById('nav-btn-results'),
    viewWorkspace: document.getElementById('view-workspace'),
    viewResults: document.getElementById('view-results'),
    btnBackToEditor: document.getElementById('btn-back-to-editor'),
    btnBottomBackToEditor: document.getElementById('btn-bottom-back-to-editor'),

    // Results Sub-Tabs
    subtabResultsBtn: document.getElementById('subtab-results-btn'),
    subtabRagBtn: document.getElementById('subtab-rag-btn'),
    subtabEvidenceBtn: document.getElementById('subtab-evidence-btn'),
    subtabAdvancedBtn: document.getElementById('subtab-advanced-btn'),
    ragPassagesBadge: document.getElementById('rag-passages-badge'),
    evidenceCountBadge: document.getElementById('evidence-count-badge'),

    // RAG Workflow Elements
    ragStep1Status: document.getElementById('rag-step1-status'),
    ragDetectedSignals: document.getElementById('rag-detected-signals'),
    ragGeneratedQueries: document.getElementById('rag-generated-queries'),
    ragRetrievedCountBadge: document.getElementById('rag-retrieved-count-badge'),
    ragRetrievedPassagesList: document.getElementById('rag-retrieved-passages-list'),
    ragStep3Badge: document.getElementById('rag-step3-badge'),
    ragGroundingSummaryBox: document.getElementById('rag-grounding-summary-box'),

    // Editor Area
    codeTextarea: document.getElementById('code-editor-textarea'),
    editorGutter: document.getElementById('editor-gutter'),
    problemDesc: document.getElementById('problem-description'),
    descCharCount: document.getElementById('desc-char-count'),
    curLine: document.getElementById('cur-line'),
    curCol: document.getElementById('cur-col'),
    btnClear: document.getElementById('btn-clear-workspace'),
    btnAnalyze: document.getElementById('btn-analyze-code'),
    analyzeSpinner: document.getElementById('analyze-spinner'),
    analyzeIcon: document.getElementById('analyze-icon'),
    analyzeBtnText: document.getElementById('analyze-btn-text'),

    // Student Sections (Results)
    studentSummaryContent: document.getElementById('student-summary-content'),
    engineBadgeLabel: document.getElementById('engine-badge-label'),
    groundingConfidenceLabel: document.getElementById('grounding-confidence-label'),
    rootCauseParagraphs: document.getElementById('root-cause-paragraphs'),
    lifecycleTimelineContent: document.getElementById('lifecycle-timeline-content'),
    issuesCountBadge: document.getElementById('issues-count-badge'),
    issuesListContainer: document.getElementById('issues-list-container'),
    fixedCodeSnippet: document.getElementById('fixed-code-snippet'),
    btnCopyFixedCode: document.getElementById('btn-copy-fixed-code'),
    copyBtnText: document.getElementById('copy-btn-text'),
    copyIcon: document.getElementById('copy-icon'),
    learnWhyContent: document.getElementById('learn-why-content'),
    btnExportMarkdown: document.getElementById('btn-export-markdown'),

    // Evidence & Sources
    passageCountLabel: document.getElementById('passage-count-label'),
    passagesContainer: document.getElementById('passages-container'),
    groundedClaimsTbody: document.getElementById('grounded-claims-tbody'),

    // Technical Signals (Optional)
    signalsContainer: document.getElementById('signals-container'),
    queriesContainer: document.getElementById('queries-container'),

    // Knowledge Base Offcanvas
    kbDropZone: document.getElementById('kb-drop-zone'),
    kbFileInput: document.getElementById('kb-file-input'),
    btnBrowseDocs: document.getElementById('btn-browse-docs'),
    kbDocList: document.getElementById('kb-doc-list'),
    kbDocCount: document.getElementById('kb-doc-count'),
    kbNavCount: document.getElementById('kb-nav-count'),
    uploadErrorAlert: document.getElementById('upload-error-alert'),
    uploadErrorMsg: document.getElementById('upload-error-msg'),
    btnResetDocs: document.getElementById('btn-reset-docs'),

    // Modals & Toasts
    chunkModal: new bootstrap.Modal(document.getElementById('chunkInspectModal')),
    modalChunkId: document.getElementById('modal-chunk-id'),
    modalChunkSource: document.getElementById('modal-chunk-source'),
    modalChunkScore: document.getElementById('modal-chunk-score'),
    modalChunkHash: document.getElementById('modal-chunk-hash'),
    modalChunkBody: document.getElementById('modal-chunk-body'),
    historyContainer: document.getElementById('history-items-container'),
    historyModalElement: document.getElementById('historyModal'),
    appToastElement: document.getElementById('appToast'),
    toastMessage: document.getElementById('toast-message'),

    // Backend Connectivity Status Elements
    systemStatusText: document.getElementById('system-status-text'),
    statusDot: document.getElementById('status-dot'),
    systemModeBadge: document.getElementById('system-mode-badge'),
    modeBadgeText: document.getElementById('mode-badge-text'),
    analysisDemoTag: document.getElementById('analysis-demo-tag')
  };

  // State Management
  let currentScenarioKey = 'python-default-arg';
  let isAnalyzing = false;
  let customDocuments = [];
  let isBackendConnected = false;
  let currentPassages = [];

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================
  function init() {
    loadScenario('python-default-arg');
    bindEventListeners();
    updateEditorGutters();
    renderHistoryList();
    checkBackendHealth();
  }

  // ==========================================================================
  // VIEW SWITCHING (STUDENT-FRIENDLY WORKSPACE VS RESULTS)
  // ==========================================================================
  function showWorkspaceView() {
    if (elements.viewWorkspace) elements.viewWorkspace.classList.remove('d-none');
    if (elements.viewResults) elements.viewResults.classList.add('d-none');
    if (elements.navBtnWorkspace) elements.navBtnWorkspace.classList.add('active');
    if (elements.navBtnResults) elements.navBtnResults.classList.remove('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showResultsView() {
    if (elements.viewWorkspace) elements.viewWorkspace.classList.add('d-none');
    if (elements.viewResults) elements.viewResults.classList.remove('d-none');
    if (elements.navBtnWorkspace) elements.navBtnWorkspace.classList.remove('active');
    if (elements.navBtnResults) elements.navBtnResults.classList.add('active');
    if (elements.subtabResultsBtn) elements.subtabResultsBtn.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==========================================================================
  // EVENT BINDINGS
  // ==========================================================================
  function bindEventListeners() {
    // View Switchers
    if (elements.navBtnWorkspace) elements.navBtnWorkspace.addEventListener('click', showWorkspaceView);
    if (elements.navBtnResults) elements.navBtnResults.addEventListener('click', showResultsView);
    if (elements.btnBackToEditor) elements.btnBackToEditor.addEventListener('click', showWorkspaceView);
    if (elements.btnBottomBackToEditor) elements.btnBottomBackToEditor.addEventListener('click', showWorkspaceView);

    // Code Editor Events
    elements.codeTextarea.addEventListener('input', () => {
      updateEditorGutters();
      updateCursorPosition();
    });

    elements.codeTextarea.addEventListener('keydown', handleEditorKeydown);
    elements.codeTextarea.addEventListener('click', updateCursorPosition);
    elements.codeTextarea.addEventListener('keyup', updateCursorPosition);

    // Problem Description Input
    elements.problemDesc.addEventListener('input', () => {
      const length = elements.problemDesc.value.length;
      elements.descCharCount.textContent = `${length} / 500`;
    });

    // Language Selector Change
    elements.languageSelect.addEventListener('change', (e) => {
      const lang = e.target.value;
      switchLanguage(lang);
    });

    // Preset Options
    elements.scenarioPresets.forEach(presetBtn => {
      presetBtn.addEventListener('click', () => {
        const key = presetBtn.getAttribute('data-preset');
        loadScenario(key);
        showToast(`Loaded preset scenario: ${presetBtn.textContent.trim()}`);
      });
    });

    // Analyze Code Action
    elements.btnAnalyze.addEventListener('click', triggerAnalysis);

    // Clear Workspace
    elements.btnClear.addEventListener('click', clearWorkspace);

    // Copy Fixed Code
    elements.btnCopyFixedCode.addEventListener('click', copyFixedCodeToClipboard);

    // Citation and Passage Inspection
    document.addEventListener('click', handleGlobalClicks);

    // Knowledge Base Drag and Drop
    setupKnowledgeBaseUpload();

    // Export Markdown
    elements.btnExportMarkdown.addEventListener('click', exportAnalysisMarkdown);
  }

  // ==========================================================================
  // CODE EDITOR HELPERS
  // ==========================================================================
  function handleEditorKeydown(e) {
    // Tab key inserts 4 spaces instead of losing focus
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = this.selectionStart;
      const end = this.selectionEnd;
      const spaces = '    ';
      this.value = this.value.substring(0, start) + spaces + this.value.substring(end);
      this.selectionStart = this.selectionEnd = start + spaces.length;
      updateEditorGutters();
      updateCursorPosition();
    }
  }

  function updateEditorGutters() {
    const lines = elements.codeTextarea.value.split('\n').length;
    let gutterHtml = '';
    for (let i = 1; i <= Math.max(1, lines); i++) {
      gutterHtml += `<span>${i}</span>`;
    }
    elements.editorGutter.innerHTML = gutterHtml;
  }

  function updateCursorPosition() {
    const text = elements.codeTextarea.value;
    const selStart = elements.codeTextarea.selectionStart;
    const linesBefore = text.substring(0, selStart).split('\n');
    const curLine = linesBefore.length;
    const curCol = linesBefore[linesBefore.length - 1].length + 1;

    elements.curLine.textContent = curLine;
    elements.curCol.textContent = curCol;
  }

  // ==========================================================================
  // SCENARIO & LANGUAGE SWITCHING
  // ==========================================================================
  function switchLanguage(lang) {
    const scenarioMap = {
      'python': 'python-default-arg',
      'c': 'c-buffer-overflow',
      'cpp': 'cpp-iterator-invalidation',
      'java': 'java-npe-unboxing',
      'javascript': 'js-closure-async'
    };
    const key = scenarioMap[lang] || 'python-default-arg';
    loadScenario(key);
  }

  function loadScenario(scenarioKey) {
    const scenario = DEMO_SCENARIOS[scenarioKey];
    if (!scenario) return;

    currentScenarioKey = scenarioKey;

    // Update Language Dropdown & File tab
    elements.languageSelect.value = scenario.language;
    elements.currentFilename.textContent = scenario.filename;
    elements.activeCorpusName.textContent = scenario.corpusName;

    // Update Input Textareas
    elements.codeTextarea.value = scenario.code;
    elements.problemDesc.value = scenario.problemDescription;
    elements.descCharCount.textContent = `${scenario.problemDescription.length} / 500`;
    updateEditorGutters();
    updateCursorPosition();

    currentPassages = scenario.passages || [];
    if (elements.retrievalDemoTag) {
      elements.retrievalDemoTag.textContent = 'DEMO DATA';
      elements.retrievalDemoTag.className = 'demo-tag';
    }
    if (elements.analysisDemoTag) {
      elements.analysisDemoTag.textContent = 'DEMO DATA';
      elements.analysisDemoTag.className = 'demo-tag';
    }

    // Populate Panels
    renderRetrievalTrace(scenario);
    renderRAGWorkflow(scenario.signals || [], scenario.queries || [], scenario.passages || [], false, true);
    renderAnalysisResults(scenario);
  }

  // ==========================================================================
  // RETRIEVAL TRACE RENDERING (PRESET / DEMO DATA)
  // ==========================================================================
  function renderRetrievalTrace(scenario) {
    // 1. Signals
    if (elements.signalsContainer) {
      elements.signalsContainer.innerHTML = (scenario.signals || []).map(s => {
        const cls = s.type === 'warning' ? 'warning-signal' : (s.type === 'info' ? 'info-signal' : '');
        return `<span class="signal-tag ${cls}"><i class="bi ${s.icon || 'bi-tag'} me-1"></i> ${escapeHtml(s.label)}</span>`;
      }).join('');
    }

    // 2. Queries
    if (elements.queriesContainer) {
      elements.queriesContainer.innerHTML = (scenario.queries || []).map(q => {
        const badgeCls = q.type === 'dense' ? 'dense-badge' : 'bm25-badge';
        return `
          <div class="query-item p-2 mb-2 rounded border">
            <div class="d-flex align-items-center justify-content-between mb-1">
              <span class="query-badge ${badgeCls}">${escapeHtml(q.label)}</span>
              <span class="query-metric">${escapeHtml(q.metric)}</span>
            </div>
            <code class="query-text">${escapeHtml(q.text)}</code>
          </div>
        `;
      }).join('');
    }

    // 3. Retrieved Passages
    const passages = scenario.passages || [];
    if (elements.passageCountLabel) {
      elements.passageCountLabel.textContent = `${passages.length} Passages Grounded (Preset Example)`;
    }
    if (elements.evidenceCountBadge) {
      elements.evidenceCountBadge.textContent = passages.length;
    }
    if (elements.passagesContainer) {
      elements.passagesContainer.innerHTML = passages.map(p => buildPassageCardHtml(p, true, false)).join('');
    }
  }

  // ==========================================================================
  // ANALYSIS RESULTS RENDERING (THE 5 STUDENT SECTIONS)
  // ==========================================================================
  function renderAnalysisResults(scenario) {
    const exp = scenario.explanation;

    // 1. Simple Explanation
    if (elements.studentSummaryContent) {
      elements.studentSummaryContent.innerHTML = `
        <div class="d-flex align-items-start gap-2">
          <i class="bi bi-lightbulb-fill text-gold mt-1 flex-shrink-0 fs-5"></i>
          <div>
            <strong class="d-block text-dark mb-1">Student Summary (TL;DR):</strong>
            <p class="mb-0 text-dark-custom" style="font-size: 0.95rem; line-height: 1.6;">
              ${exp.paragraphs[0] || 'Demonstration scenario analysis.'}
            </p>
          </div>
        </div>
      `;
    }
    if (elements.engineBadgeLabel) {
      elements.engineBadgeLabel.innerHTML = `
        <i class="bi bi-lightning-charge text-gold me-1"></i> Demo Preset Grounding
      `;
    }

    // 2. Root Cause / What Went Wrong
    if (elements.groundingConfidenceLabel) {
      elements.groundingConfidenceLabel.innerHTML = `
        <i class="bi bi-shield-check text-gold me-1"></i> ${exp.confidence}
      `;
    }
    if (elements.rootCauseParagraphs) {
      elements.rootCauseParagraphs.innerHTML = exp.paragraphs.map(p => `<p class="analysis-body-text mb-2">${p}</p>`).join('');
    }
    if (elements.lifecycleTimelineContent) {
      elements.lifecycleTimelineContent.innerHTML = exp.timeline.map((item, idx) => `
        <div class="timeline-step">
          <div class="timeline-marker">${idx + 1}</div>
          <div class="timeline-content">
            <strong class="timeline-title">${escapeHtml(item.title)}</strong>
            <p class="timeline-desc mb-0">${item.desc}</p>
          </div>
        </div>
      `).join('');
    }

    // 3. Issues Found
    if (elements.issuesCountBadge) {
      elements.issuesCountBadge.textContent = `${scenario.issues.length} Issue${scenario.issues.length === 1 ? '' : 's'}`;
    }
    if (elements.issuesListContainer) {
      elements.issuesListContainer.innerHTML = scenario.issues.map(iss => `
        <div class="issue-card mb-3 p-3 border rounded">
          <div class="d-flex align-items-start justify-content-between mb-2">
            <div class="d-flex align-items-center gap-2">
              <span class="issue-severity-badge ${iss.severityClass}">
                <i class="bi bi-exclamation-triangle-fill me-1"></i> ${iss.severity}
              </span>
              <span class="issue-location">${escapeHtml(iss.location)}</span>
            </div>
            <span class="claim-badge badge-doc-backed">${iss.grounding}</span>
          </div>

          <h4 class="issue-card-title mb-1">${escapeHtml(iss.title)}</h4>
          <p class="issue-card-desc mb-2 text-secondary">${escapeHtml(iss.description)}</p>

          <div class="issue-diff-hint p-2 mb-2 bg-editor-gutter rounded">
            <code class="text-danger">- ${escapeHtml(iss.diffMinus)}</code><br>
            <code class="text-success">+ ${escapeHtml(iss.diffPlus)}</code>
          </div>

          <div class="d-flex align-items-center justify-content-between pt-1 border-top">
            <span class="issue-rule-code">Rule: <code>${escapeHtml(iss.rule)}</code></span>
            ${iss.sourceId ? `<a href="#passage-${iss.sourceId}" class="citation-link" data-citation="${iss.sourceId}">View Doc Evidence [${iss.sourceId.toUpperCase()}] &rarr;</a>` : ''}
          </div>
        </div>
      `).join('');
    }

    // 4. Corrected Code
    if (elements.fixedCodeSnippet) {
      elements.fixedCodeSnippet.textContent = scenario.fixedCode;
    }

    // 5. Learn Why This Fix Works
    if (elements.learnWhyContent) {
      elements.learnWhyContent.innerHTML = `
        <ul class="recommendation-list mb-0 ps-3">
          <li class="mb-2"><strong>Why this fix works:</strong> Using immutable sentinels (such as <code>None</code>, <code>nullptr</code>, or <code>null</code>) ensures that fresh object instances are allocated dynamically inside the local function frame rather than persisting in module state.</li>
          <li class="mb-2"><strong>Defensive Programming Guardrail:</strong> Never bind mutable objects (lists, dictionaries, vectors) as default values in function signatures.</li>
          <li><strong>Automated Linter Integration:</strong> Enable static analysis rules (e.g. Flake8/Ruff <code>B006</code> or Clang-Tidy) in continuous integration to catch these patterns before code review.</li>
        </ul>
      `;
    }

    // Evidence Claims Index
    if (elements.groundedClaimsTbody) {
      elements.groundedClaimsTbody.innerHTML = exp.tableRows.map(row => `
        <tr>
          <td><code>${escapeHtml(row.ref)}</code></td>
          <td>${escapeHtml(row.claim)}</td>
          <td><span class="claim-badge ${row.badgeClass}">${escapeHtml(row.badge)}</span></td>
          <td>${row.sourceId ? `<a href="#passage-${row.sourceId}" class="citation-link" data-citation="${row.sourceId}">${escapeHtml(row.source)}</a>` : escapeHtml(row.source)}</td>
        </tr>
      `).join('');
    }
  }

  // ==========================================================================
  // BACKEND API INTEGRATION & RAG RETRIEVAL PIPELINE
  // ==========================================================================
  async function checkBackendHealth() {
    try {
      const resp = await fetch('/api/v1/health/');
      if (resp.ok) {
        const data = await resp.json();
        isBackendConnected = true;
        if (elements.systemStatusText) {
          elements.systemStatusText.textContent = 'Django Backend (Live)';
        }
        if (elements.statusDot) {
          elements.statusDot.style.backgroundColor = '#559139';
        }
        if (elements.systemModeBadge) {
          elements.systemModeBadge.innerHTML = `<i class="bi bi-shield-check me-1 text-success"></i> <span id="mode-badge-text">${data.gemini_configured ? 'Live RAG + Gemini' : 'Live RAG Ready'}</span>`;
        }
        await loadBackendDocuments();
      }
    } catch (e) {
      isBackendConnected = false;
      if (elements.systemStatusText) {
        elements.systemStatusText.textContent = 'Local workspace';
      }
      if (elements.modeBadgeText) {
        elements.modeBadgeText.textContent = 'Demo Mode';
      }
    }
  }

  async function loadBackendDocuments() {
    if (!isBackendConnected) return;
    try {
      const resp = await fetch('/api/v1/documents/');
      if (resp.ok) {
        const data = await resp.json();
        const docs = data.documents || [];
        const stats = data.stats || {};

        elements.kbDocCount.textContent = docs.length;
        elements.kbNavCount.textContent = `${docs.length} docs`;
        const statChunksEl = document.getElementById('stat-total-chunks');
        if (statChunksEl) statChunksEl.textContent = stats.chunks_count || 0;

        if (docs.length === 0) {
          elements.kbDocList.innerHTML = `
            <div class="text-center py-4 px-2 text-secondary" style="font-size: 0.85rem;">
              <i class="bi bi-folder2-open fs-3 d-block mb-2 text-gold"></i>
              No documents in RAG corpus yet.<br>
              Upload PDF or TXT documentation above to enable grounded retrieval.
            </div>
          `;
          return;
        }

        elements.kbDocList.innerHTML = docs.map(doc => `
          <div class="kb-doc-item p-3 mb-2 rounded border" data-doc-id="${doc.id}">
            <div class="d-flex align-items-start justify-content-between">
              <div class="d-flex align-items-start gap-2">
                <div class="doc-type-icon ${doc.extension === '.pdf' ? 'pdf-icon' : 'txt-icon'}">
                  <i class="bi ${doc.extension === '.pdf' ? 'bi-file-earmark-pdf' : 'bi-file-earmark-text'}"></i>
                </div>
                <div>
                  <h5 class="doc-item-title mb-0">${escapeHtml(doc.filename)}</h5>
                  <span class="doc-item-meta">${formatFileSize(doc.file_size)} &bull; ${doc.chunks_count} Chunks ${doc.page_count ? `&bull; ${doc.page_count} Pages` : ''}</span>
                </div>
              </div>
              <div class="d-flex align-items-center gap-2">
                <span class="badge-subtle-success">Indexed (FAISS)</span>
                <button type="button" class="btn btn-delete-doc delete-doc-btn" data-doc-id="${doc.id}" title="Remove document from corpus" aria-label="Delete document">
                  <i class="bi bi-trash3"></i>
                </button>
              </div>
            </div>
            <div class="doc-item-progress mt-2">
              <div class="progress" style="height: 4px;">
                <div class="progress-bar custom-progress-bar" style="width: 100%"></div>
              </div>
            </div>
          </div>
        `).join('');

        // Bind delete buttons
        elements.kbDocList.querySelectorAll('.delete-doc-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const docId = btn.getAttribute('data-doc-id');
            await deleteBackendDocument(docId);
          });
        });
      }
    } catch (e) {
      console.warn('Failed to load backend documents:', e);
    }
  }

  async function deleteBackendDocument(docId) {
    try {
      const resp = await fetch(`/api/v1/documents/${docId}/`, { method: 'DELETE' });
      if (resp.ok) {
        showToast('Document removed and vector index rebuilt.');
        await loadBackendDocuments();
      } else {
        const data = await resp.json();
        showToast(`Failed to remove document: ${data.error || 'Unknown error'}`);
      }
    } catch (e) {
      showToast('Error communicating with backend to delete document.');
    }
  }

  async function triggerAnalysis() {
    if (isAnalyzing) return;

    const code = elements.codeTextarea.value.trim();
    if (!code) {
      showToast('Please enter some code to analyze first.');
      elements.codeTextarea.focus();
      return;
    }

    isAnalyzing = true;
    elements.analyzeSpinner.classList.remove('d-none');
    elements.analyzeIcon.classList.add('d-none');
    elements.btnAnalyze.disabled = true;
    elements.analyzeBtnText.textContent = 'Extracting AST Signals...';

    const lang = elements.languageSelect.value;
    const problemDesc = elements.problemDesc.value.trim();

    // LIVE DJANGO BACKEND CALL
    if (isBackendConnected) {
      try {
        setTimeout(() => { elements.analyzeBtnText.textContent = 'Querying FAISS Vector Corpus...'; }, 300);
        setTimeout(() => { elements.analyzeBtnText.textContent = 'Grounded Claim Synthesis...'; }, 700);

        const response = await fetch('/api/v1/analyze/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code,
            language: lang,
            problem_description: problemDesc
          })
        });

        const data = await response.json();
        if (response.ok && data.status === 'success') {
          currentPassages = data.passages || [];

          // Render Live Signals
          renderRealSignals(data.signals || []);

          // Render Live Queries
          renderRealQueries(data.queries || []);

          // Render Live Retrieved Passages
          renderRealPassages(data.passages || [], data.knowledge_base_empty);

          // Render RAG Retrieval Workflow Tab
          renderRAGWorkflow(data.signals || [], data.queries || [], data.passages || [], data.knowledge_base_empty, false);

          // Render Live Grounded Analysis into the 5 Student Sections
          renderRealAnalysisResults(data.explanation, data.issues, data.fixed_code, data);

          // Update tags
          if (data.ai_provider === 'google-gemini') {
            if (elements.analysisDemoTag) {
              elements.analysisDemoTag.textContent = 'GEMINI FLASH (LIVE GROUNDED)';
              elements.analysisDemoTag.className = 'live-rag-tag';
            }
          } else if (data.knowledge_base_empty) {
            if (elements.analysisDemoTag) {
              elements.analysisDemoTag.textContent = 'LOCAL ENGINE (EMPTY CORPUS)';
              elements.analysisDemoTag.className = 'empty-corpus-tag';
            }
          } else {
            if (elements.analysisDemoTag) {
              elements.analysisDemoTag.textContent = 'LOCAL ENGINE (LIVE FAISS)';
              elements.analysisDemoTag.className = 'live-rag-tag';
            }
          }

          // Switch to results view smoothly
          showResultsView();
          showToast('Live analysis complete. Review your diagnosis and verified fix.');
          return;
        } else {
          showToast(`Analysis API error: ${data.error || 'Server error'}. Using local preview.`);
        }
      } catch (err) {
        console.warn('Backend analyze call failed, falling back to simulated scenario:', err);
        showToast('Backend connection error. Displaying local scenario demonstration.');
      } finally {
        isAnalyzing = false;
        elements.analyzeSpinner.classList.add('d-none');
        elements.analyzeIcon.classList.remove('d-none');
        elements.btnAnalyze.disabled = false;
        elements.analyzeBtnText.textContent = 'Analyze My Code';
      }
    }

    // Fallback to demo simulation if backend is not available
    setTimeout(() => { elements.analyzeBtnText.textContent = 'Retrieving Doc Passages...'; }, 400);
    setTimeout(() => { elements.analyzeBtnText.textContent = 'Grounding Claims...'; }, 800);
    setTimeout(() => {
      isAnalyzing = false;
      elements.analyzeSpinner.classList.add('d-none');
      elements.analyzeIcon.classList.remove('d-none');
      elements.btnAnalyze.disabled = false;
      elements.analyzeBtnText.textContent = 'Analyze My Code';

      const scenario = DEMO_SCENARIOS[currentScenarioKey];
      if (scenario) {
        renderRAGWorkflow(scenario.signals || [], scenario.queries || [], scenario.passages || [], false, true);
      }

      showResultsView();
      showToast('Analysis complete. Showing student diagnosis.');
    }, 1200);
  }

  function renderRealSignals(signals) {
    if (!elements.signalsContainer) return;
    if (!signals || signals.length === 0) {
      elements.signalsContainer.innerHTML = '<span class="text-secondary" style="font-size: 0.8rem;">No explicit syntax anomalies detected.</span>';
      return;
    }
    elements.signalsContainer.innerHTML = signals.map(s => {
      const cls = s.type === 'warning' ? 'warning-signal' : (s.type === 'info' ? 'info-signal' : '');
      return `<span class="signal-tag ${cls}"><i class="bi ${s.icon || 'bi-tag'} me-1"></i> ${escapeHtml(s.label)}</span>`;
    }).join('');
  }

  function renderRealQueries(queries) {
    if (!elements.queriesContainer) return;
    if (!queries || queries.length === 0) return;
    elements.queriesContainer.innerHTML = queries.map(q => {
      const badgeCls = q.type === 'dense' ? 'dense-badge' : 'bm25-badge';
      return `
        <div class="query-item p-2 mb-2 rounded border">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <span class="query-badge ${badgeCls}">${escapeHtml(q.label)}</span>
            <span class="query-metric">${escapeHtml(q.metric)}</span>
          </div>
          <code class="query-text">${escapeHtml(q.text)}</code>
        </div>
      `;
    }).join('');
  }
  // ==========================================================================
  // PASSAGE CARD & CITATION FORMATTING HELPERS
  // ==========================================================================
  function formatInlineCitations(text) {
    if (!text || typeof text !== 'string') return text || '';
    // Replace raw [S1], [S2] with interactive citation links
    return text.replace(/\[(S\d+)\]/gi, (match, p1) => {
      const cleanId = p1.toUpperCase();
      return `<a href="#passage-${cleanId.toLowerCase()}" class="citation-link badge-source-inline" data-citation="${cleanId.toLowerCase()}">[${cleanId}]</a>`;
    });
  }

  function buildPassageCardHtml(p, isPreset = false, isRagTab = false) {
    const rawQuote = p.quote || '';
    const isLong = rawQuote.length > 180;
    let excerpt = rawQuote;
    if (isLong) {
      const truncated = rawQuote.slice(0, 180);
      const lastSpace = truncated.lastIndexOf(' ');
      excerpt = (lastSpace > 120 ? truncated.slice(0, lastSpace) : truncated).trim() + '...';
    }

    const scoreDisplay = p.rawScore !== undefined 
      ? `Cosine Sim: ${p.score} <span class="score-sub">(Live FAISS)</span>` 
      : (isPreset ? `Score: ${p.score} <span class="score-sub">(Preset)</span>` : `Cosine Sim: ${p.score}`);

    const idPrefix = isRagTab ? 'rag-passage-' : 'passage-';
    const cardClass = isRagTab ? 'rag-passage-chunk mb-3' : 'passage-card mb-3 p-3';
    const pageMeta = p.docMeta 
      ? escapeHtml(p.docMeta) 
      : (p.pageNumber ? `Page ${p.pageNumber} • ${escapeHtml(p.fileName)}` : `Chunk ${(p.chunkIndex || 0) + 1} • ${escapeHtml(p.fileName)}`);

    return `
      <article class="${cardClass}" id="${idPrefix}${p.id.toLowerCase()}" data-source="${p.id}" data-hash="${escapeHtml(p.hash || '')}">
        <div class="passage-card-top d-flex align-items-start justify-content-between flex-wrap gap-2 mb-2">
          <div class="d-flex align-items-center gap-2">
            <span class="source-id-badge" title="Source ${p.id} Citation">[${p.id}]</span>
            <div>
              <strong class="passage-doc-title mb-0 d-block">${escapeHtml(p.docTitle || p.fileName)}</strong>
              <span class="passage-doc-meta text-secondary" style="font-size: 0.74rem;">${pageMeta}</span>
            </div>
          </div>
          <div>
            <span class="relevance-score-badge" title="Real retrieval similarity score returned by backend FAISS">
              <i class="bi bi-graph-up-arrow me-1 text-gold"></i>
              ${scoreDisplay}
            </span>
          </div>
        </div>

        <div class="passage-quote-box mb-2 p-2 rounded bg-warm-ivory border">
          <div class="passage-quote-text mb-0" style="font-size: 0.85rem; line-height: 1.55; font-style: italic;">
            ${isLong ? `
              <span class="passage-excerpt">&ldquo;${escapeHtml(excerpt)}&rdquo;</span>
              <span class="passage-full d-none">&ldquo;${escapeHtml(rawQuote)}&rdquo;</span>
            ` : `
              <span>&ldquo;${escapeHtml(rawQuote)}&rdquo;</span>
            `}
          </div>
          ${isLong ? `
            <button type="button" class="btn btn-link btn-sm p-0 mt-1 text-gold-action toggle-excerpt-btn fw-semibold" style="font-size: 0.76rem;">
              <i class="bi bi-chevron-down me-1"></i>Show More
            </button>
          ` : ''}
        </div>

        <div class="passage-card-footer d-flex align-items-center justify-content-between flex-wrap gap-2 pt-1">
          <span class="passage-corpus-tag text-secondary" style="font-size: 0.74rem;">
            <i class="bi bi-file-earmark-text text-gold me-1"></i> <strong>${escapeHtml(p.fileName)}</strong>
          </span>
          <div class="d-flex align-items-center gap-2">
            ${isRagTab ? `
              <button type="button" class="btn btn-link btn-sm p-0 text-secondary jump-evidence-btn" data-passage="${p.id.toLowerCase()}" title="Highlight in Evidence & Sources">
                <i class="bi bi-arrow-right-circle me-1"></i>Evidence Tab
              </button>
            ` : ''}
            <button type="button" class="btn btn-link btn-sm p-0 text-gold-action inspect-passage-btn" data-passage="${p.id.toLowerCase()}">
              <i class="bi bi-zoom-in me-1"></i>Inspect Full Chunk
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function renderRealPassages(passages, isEmpty) {
    if (isEmpty || !passages || passages.length === 0) {
      if (elements.passageCountLabel) elements.passageCountLabel.textContent = '0 Passages (Corpus Empty)';
      if (elements.evidenceCountBadge) elements.evidenceCountBadge.textContent = '0';
      if (elements.passagesContainer) {
        elements.passagesContainer.innerHTML = `
          <div class="alert alert-subtle-gold p-3 mb-2 rounded border">
            <div class="d-flex align-items-start gap-2">
              <i class="bi bi-info-circle-fill text-gold mt-1 flex-shrink-0"></i>
              <div style="font-size: 0.85rem; line-height: 1.5;">
                <strong>Knowledge Base Empty:</strong> No reference documents were matched in your RAG corpus. 
                Upload official language specs or lecture notes (.pdf, .txt, .md) in the Knowledge Base drawer to ground your claims against real passages.
              </div>
            </div>
          </div>
        `;
      }
      return;
    }

    if (elements.passageCountLabel) elements.passageCountLabel.textContent = `${passages.length} Passages Grounded (Live FAISS)`;
    if (elements.evidenceCountBadge) elements.evidenceCountBadge.textContent = passages.length;
    if (elements.passagesContainer) {
      elements.passagesContainer.innerHTML = passages.map(p => buildPassageCardHtml(p, false, false)).join('');
    }
  }

  // ==========================================================================
  // RAG RETRIEVAL WORKFLOW RENDERING (STUDENT-FACING STEP-BY-STEP)
  // ==========================================================================
  function renderRAGWorkflow(signals, queries, passages, isEmpty, isPreset = false) {
    const count = (isEmpty || !passages) ? 0 : passages.length;

    // 0. Tab Badge
    if (elements.ragPassagesBadge) {
      elements.ragPassagesBadge.textContent = `${count} ${count === 1 ? 'Passage' : 'Passages'}`;
    }

    // 1. Step 1: Code Signals & Generated Search Queries
    if (elements.ragStep1Status) {
      elements.ragStep1Status.textContent = `${queries.length} Queries Formed`;
    }

    if (elements.ragDetectedSignals) {
      if (!signals || signals.length === 0) {
        elements.ragDetectedSignals.innerHTML = '<span class="text-secondary" style="font-size: 0.8rem;">No explicit syntax anomalies detected. Standard language parsing active.</span>';
      } else {
        elements.ragDetectedSignals.innerHTML = signals.map(s => {
          const cls = s.type === 'warning' ? 'warning-signal' : (s.type === 'info' ? 'info-signal' : '');
          const label = s.label || s.name || s.type;
          const detail = s.detail ? `: <code>${escapeHtml(s.detail)}</code>` : '';
          return `<span class="signal-tag ${cls}"><i class="bi ${s.icon || 'bi-tag'} me-1"></i> ${escapeHtml(label)}${detail}</span>`;
        }).join('');
      }
    }

    if (elements.ragGeneratedQueries) {
      if (!queries || queries.length === 0) {
        elements.ragGeneratedQueries.innerHTML = '<span class="text-secondary" style="font-size: 0.8rem;">No specific search queries generated.</span>';
      } else {
        elements.ragGeneratedQueries.innerHTML = queries.map(q => {
          const badgeCls = q.type === 'dense' ? 'dense-badge' : 'bm25-badge';
          return `
            <div class="rag-query-card p-2 rounded border bg-surface">
              <div class="d-flex align-items-center justify-content-between mb-1">
                <span class="query-badge ${badgeCls}">
                  <i class="bi bi-search me-1"></i> ${escapeHtml(q.label || q.type || 'Search Query')}
                </span>
                <span class="query-metric">${escapeHtml(q.metric || 'Cosine Similarity')}</span>
              </div>
              <code class="query-text">${escapeHtml(q.text)}</code>
            </div>
          `;
        }).join('');
      }
    }

    // 2. Step 2: Retrieved Document Passages & Relevance Scores
    if (elements.ragRetrievedCountBadge) {
      elements.ragRetrievedCountBadge.textContent = `${count} ${count === 1 ? 'Passage' : 'Passages'} Matched`;
    }

    if (elements.ragRetrievedPassagesList) {
      if (isEmpty || !passages || passages.length === 0) {
        elements.ragRetrievedPassagesList.innerHTML = `
          <div class="alert alert-subtle-gold p-3 rounded border">
            <div class="d-flex align-items-start gap-2">
              <i class="bi bi-info-circle-fill text-gold mt-1 flex-shrink-0 fs-5"></i>
              <div>
                <strong class="d-block text-dark mb-1">No Relevant Passages Found in Knowledge Base:</strong>
                <p class="mb-2 text-secondary" style="font-size: 0.85rem; line-height: 1.5;">
                  No reference documentation is currently indexed in your Knowledge Base matching these queries. EvidenceDebug AI fell back to language semantics and universal debugging best practices.
                </p>
                <div class="p-2 rounded bg-surface border text-secondary" style="font-size: 0.82rem;">
                  <i class="bi bi-lightbulb text-gold me-1"></i>
                  <strong>How to enable live document citations:</strong> Open the <strong>Knowledge Base</strong> drawer in the top navigation bar and upload course notes, textbooks, or language specifications (.pdf, .txt, .md). The next analysis will retrieve and highlight proof directly from your files!
                </div>
              </div>
            </div>
          </div>
        `;
      } else {
        elements.ragRetrievedPassagesList.innerHTML = passages.map(p => buildPassageCardHtml(p, isPreset, true)).join('');
      }
    }

    // 3. Step 3: Evidence Grounding & AI Explanation
    if (elements.ragStep3Badge) {
      elements.ragStep3Badge.innerHTML = (isEmpty || !passages || passages.length === 0)
        ? '<i class="bi bi-book me-1"></i> General Knowledge'
        : `<i class="bi bi-shield-check me-1"></i> Grounded (${count} Sources)`;
    }

    if (elements.ragGroundingSummaryBox) {
      if (isEmpty || !passages || passages.length === 0) {
        elements.ragGroundingSummaryBox.innerHTML = `
          <div class="d-flex align-items-center justify-content-between mb-1">
            <strong class="text-dark-custom" style="font-size: 0.86rem;">Synthesis Mode: General Language Semantics</strong>
            <span class="claim-badge badge-general-knowledge">GENERAL KNOWLEDGE</span>
          </div>
          <p class="mb-0 text-secondary" style="font-size: 0.82rem; line-height: 1.5;">
            Because the Knowledge Base is currently empty or contains no matching passages, the AI synthesized this explanation from core programming language semantics and universal debugging best practices without citing external files.
          </p>
        `;
      } else {
        const firstPassageId = passages[0].id.toLowerCase();
        elements.ragGroundingSummaryBox.innerHTML = `
          <div class="d-flex align-items-center justify-content-between mb-1">
            <strong class="text-dark-custom" style="font-size: 0.86rem;">Synthesis Mode: Document-Grounded Explanation</strong>
            <span class="claim-badge badge-doc-backed"><i class="bi bi-check2-circle me-1"></i> DOC-BACKED</span>
          </div>
          <p class="mb-0 text-dark-custom" style="font-size: 0.82rem; line-height: 1.5;">
            EvidenceDebug AI verified its diagnosis against <strong>${count} retrieved document ${count === 1 ? 'passage' : 'passages'}</strong> from your Knowledge Base. 
            In the <strong>Analysis Results</strong> tab, look for citations like <a href="#passage-${firstPassageId}" class="citation-link badge-source-inline" data-citation="${firstPassageId}">[${passages[0].id}]</a> next to key assertions. Clicking any citation automatically spotlights the exact retrieved proof above!
          </p>
        `;
      }
    }
  }

  function renderRealAnalysisResults(explanation, issues, fixedCode, meta = {}) {
    if (!explanation) return;

    const isGemini = (meta.ai_provider === 'google-gemini');

    // 1. Simple Explanation
    if (elements.studentSummaryContent) {
      const rawSummary = meta.summary || (explanation.paragraphs && explanation.paragraphs[0]) || 'Analysis complete.';
      const renderedSummary = (typeof rawSummary === 'string' && rawSummary.includes('<'))
        ? formatInlineCitations(rawSummary)
        : formatInlineCitations(escapeHtml(rawSummary));
      elements.studentSummaryContent.innerHTML = `
        <div class="d-flex align-items-start gap-2">
          <i class="bi bi-lightbulb-fill text-gold mt-1 flex-shrink-0 fs-5"></i>
          <div>
            <strong class="d-block text-dark mb-1">Student Summary (TL;DR):</strong>
            <p class="mb-0 text-dark-custom" style="font-size: 0.95rem; line-height: 1.6;">
              ${renderedSummary}
            </p>
          </div>
        </div>
      `;
    }
    if (elements.engineBadgeLabel) {
      elements.engineBadgeLabel.innerHTML = isGemini 
        ? '<i class="bi bi-stars text-gold me-1"></i> Gemini Flash (Live Grounded)' 
        : '<i class="bi bi-cpu text-secondary me-1"></i> Local Grounded Engine';
    }

    // 2. Root Cause / What Went Wrong
    if (elements.groundingConfidenceLabel) {
      elements.groundingConfidenceLabel.innerHTML = `
        <i class="bi bi-shield-check text-gold me-1"></i> ${escapeHtml(explanation.confidence || 'Live Grounded')}
      `;
    }
    if (elements.rootCauseParagraphs) {
      elements.rootCauseParagraphs.innerHTML = (explanation.paragraphs || []).map(p => `<p class="analysis-body-text mb-2">${formatInlineCitations(p)}</p>`).join('');
    }
    if (elements.lifecycleTimelineContent) {
      elements.lifecycleTimelineContent.innerHTML = (explanation.timeline || []).map((item, idx) => `
        <div class="timeline-step">
          <div class="timeline-marker">${idx + 1}</div>
          <div class="timeline-content">
            <strong class="timeline-title">${escapeHtml(item.title)}</strong>
            <p class="timeline-desc mb-0">${formatInlineCitations(escapeHtml(item.desc))}</p>
          </div>
        </div>
      `).join('');
    }

    // 3. Issues Found
    const issuesList = issues || [];
    if (elements.issuesCountBadge) {
      elements.issuesCountBadge.textContent = `${issuesList.length} Issue${issuesList.length === 1 ? '' : 's'}`;
    }
    if (elements.issuesListContainer) {
      elements.issuesListContainer.innerHTML = issuesList.map(iss => `
        <div class="issue-card mb-3 p-3 border rounded">
          <div class="d-flex align-items-start justify-content-between mb-2">
            <div class="d-flex align-items-center gap-2">
              <span class="issue-severity-badge ${iss.severityClass || 'severity-high'}">
                <i class="bi bi-exclamation-triangle-fill me-1"></i> ${escapeHtml(iss.severity || 'HIGH')}
              </span>
              <span class="issue-location">${escapeHtml(iss.location || '')}</span>
            </div>
            <span class="claim-badge badge-doc-backed">${escapeHtml(iss.grounding || 'DOC-BACKED')}</span>
          </div>

          <h4 class="issue-card-title mb-1">${escapeHtml(iss.title || 'Potential Bug')}</h4>
          <p class="issue-card-desc mb-2 text-secondary">${formatInlineCitations(escapeHtml(iss.description || ''))}</p>

          <div class="issue-diff-hint p-2 mb-2 bg-editor-gutter rounded">
            <code class="text-danger">- ${escapeHtml(iss.diffMinus || '')}</code><br>
            <code class="text-success">+ ${escapeHtml(iss.diffPlus || '')}</code>
          </div>

          <div class="d-flex align-items-center justify-content-between pt-1 border-top">
            <span class="issue-rule-code">Rule: <code>${escapeHtml(iss.rule || 'StaticLinterCheck')}</code></span>
            ${iss.sourceId ? `<a href="#passage-${iss.sourceId.toLowerCase()}" class="citation-link badge-source-inline" data-citation="${iss.sourceId.toLowerCase()}">View Doc Evidence [${iss.sourceId.toUpperCase()}] &rarr;</a>` : ''}
          </div>
        </div>
      `).join('');
    }

    // 4. Corrected Code
    if (elements.fixedCodeSnippet) {
      elements.fixedCodeSnippet.textContent = fixedCode || '// Corrected code not generated';
    }

    // 5. Learn Why This Fix Works
    if (elements.learnWhyContent) {
      const educationalNote = (explanation.paragraphs && explanation.paragraphs.length > 1) 
        ? explanation.paragraphs[explanation.paragraphs.length - 1] 
        : 'Using defensive parameter values prevents cross-call mutation and subtle state retention bugs.';
      elements.learnWhyContent.innerHTML = `
        <ul class="recommendation-list mb-0 ps-3">
          <li class="mb-2"><strong>Why this fix works:</strong> ${formatInlineCitations(educationalNote)}</li>
          <li class="mb-2"><strong>Architectural Best Practice:</strong> Adhere to defensive parameter binding and immutable sentinels across function interfaces.</li>
          <li><strong>Static Linter Integration:</strong> Enable automated lint checks to catch risky constructs during continuous integration.</li>
        </ul>
      `;
    }

    // Grounded Claims Table
    if (elements.groundedClaimsTbody) {
      elements.groundedClaimsTbody.innerHTML = (explanation.tableRows || []).map(row => `
        <tr>
          <td><code>${escapeHtml(row.ref)}</code></td>
          <td>${escapeHtml(row.claim)}</td>
          <td><span class="claim-badge ${row.badgeClass || 'badge-doc-backed'}">${escapeHtml(row.badge)}</span></td>
          <td>${row.sourceId ? `<a href="#passage-${row.sourceId}" class="citation-link" data-citation="${row.sourceId}">${escapeHtml(row.source)}</a>` : escapeHtml(row.source)}</td>
        </tr>
      `).join('');
    }
  }

  // ==========================================================================
  // CLEAR WORKSPACE
  // ==========================================================================
  function clearWorkspace() {
    elements.codeTextarea.value = '';
    elements.problemDesc.value = '';
    elements.descCharCount.textContent = '0 / 500';
    updateEditorGutters();
    updateCursorPosition();

    // Show Empty States
    elements.retrievalContentView.classList.add('d-none');
    elements.retrievalEmptyState.classList.remove('d-none');

    elements.analysisEmptyState.classList.remove('d-none');
    elements.tabExplanation.classList.add('d-none');
    elements.tabIssues.classList.add('d-none');
    elements.tabFixedCode.classList.add('d-none');

    showToast('Workspace cleared. Ready for new code input.');
  }

  // ==========================================================================
  // GLOBAL CLICKS: CITATIONS & CHUNK INSPECTION
  // ==========================================================================
  function handleGlobalClicks(e) {
    // 1. Citation Link Clicked ([S1], [S2]) -> Spotlight in Evidence & Sources or RAG Workflow
    const citationLink = e.target.closest('.citation-link, .badge-source-inline');
    if (citationLink) {
      e.preventDefault();
      const rawCitation = citationLink.getAttribute('data-citation') || citationLink.textContent.trim();
      const citationId = rawCitation.replace(/[\[\]]/g, '').trim();
      if (citationId) {
        spotlightPassage(citationId);
        return;
      }
    }

    // 2. Toggle Excerpt Clicked ("Show More" / "Show Less")
    const toggleBtn = e.target.closest('.toggle-excerpt-btn');
    if (toggleBtn) {
      e.preventDefault();
      const quoteBox = toggleBtn.closest('.passage-quote-box');
      if (quoteBox) {
        const excerptEl = quoteBox.querySelector('.passage-excerpt');
        const fullEl = quoteBox.querySelector('.passage-full');
        if (excerptEl && fullEl) {
          const isCollapsed = fullEl.classList.contains('d-none');
          if (isCollapsed) {
            excerptEl.classList.add('d-none');
            fullEl.classList.remove('d-none');
            toggleBtn.innerHTML = '<i class="bi bi-chevron-up me-1"></i>Show Less';
          } else {
            fullEl.classList.add('d-none');
            excerptEl.classList.remove('d-none');
            toggleBtn.innerHTML = '<i class="bi bi-chevron-down me-1"></i>Show More';
          }
        }
      }
      return;
    }

    // 3. Jump to Evidence Tab Button Clicked
    const jumpBtn = e.target.closest('.jump-evidence-btn');
    if (jumpBtn) {
      e.preventDefault();
      const passageKey = jumpBtn.getAttribute('data-passage');
      spotlightPassage(passageKey);
      return;
    }

    // 4. Inspect Chunk Button Clicked
    const inspectBtn = e.target.closest('.inspect-passage-btn');
    if (inspectBtn) {
      e.preventDefault();
      const passageKey = inspectBtn.getAttribute('data-passage');
      openChunkInspectionModal(passageKey);
    }
  }

  function spotlightPassage(citationId) {
    if (!citationId) return;
    const cleanId = citationId.toLowerCase().replace(/[\[\]]/g, '');

    // Switch to Evidence & Sources sub-tab if not already active
    if (elements.subtabEvidenceBtn && !elements.subtabEvidenceBtn.classList.contains('active')) {
      elements.subtabEvidenceBtn.click();
    }

    setTimeout(() => {
      // Find matching passage element in Evidence or RAG tabs
      const passageEl = document.getElementById(`passage-${cleanId}`) || document.getElementById(`rag-passage-${cleanId}`);
      if (!passageEl) return;

      passageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      passageEl.classList.add('spotlight-passage');
      setTimeout(() => {
        passageEl.classList.remove('spotlight-passage');
      }, 2500);

      showToast(`Focused on documentation passage [${cleanId.toUpperCase()}].`);
    }, 150);
  }

  function openChunkInspectionModal(passageKey) {
    let passage = currentPassages.find(p => p.id.toLowerCase() === passageKey.toLowerCase());
    if (!passage) {
      const scenario = DEMO_SCENARIOS[currentScenarioKey];
      if (scenario) {
        passage = scenario.passages.find(p => p.id.toLowerCase() === passageKey.toLowerCase());
      }
    }
    if (!passage) return;

    elements.modalChunkId.textContent = `[${passage.id}]`;
    const pageInfo = passage.pageNumber ? `Page ${passage.pageNumber}` : (passage.chunkIndex !== undefined ? `Chunk ${passage.chunkIndex + 1}` : '');
    elements.modalChunkSource.textContent = `${passage.docTitle || passage.fileName}${pageInfo ? ' • ' + pageInfo : ''}`;
    elements.modalChunkScore.textContent = `Cosine Similarity: ${passage.score} ${passage.rawScore !== undefined ? '(Live FAISS)' : '(Illustrative Metric)'}`;
    elements.modalChunkHash.textContent = passage.hash || 'hash_chunk_index';
    elements.modalChunkBody.innerHTML = `<p class="mb-0 text-dark-custom" style="font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap;">&ldquo;${escapeHtml(passage.quote)}&rdquo;</p>`;

    elements.chunkModal.show();
  }

  // ==========================================================================
  // KNOWLEDGE BASE FILE UPLOAD & VALIDATION
  // ==========================================================================
  function setupKnowledgeBaseUpload() {
    const dropZone = elements.kbDropZone;
    const fileInput = elements.kbFileInput;

    dropZone.addEventListener('click', () => fileInput.click());
    elements.btnBrowseDocs.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      handleSelectedFiles(files);
    });

    fileInput.addEventListener('change', () => {
      handleSelectedFiles(fileInput.files);
    });

    elements.btnResetDocs.addEventListener('click', async () => {
      customDocuments = [];
      if (isBackendConnected) {
        await loadBackendDocuments();
      } else {
        renderDocumentList();
      }
      showToast('Corpus view refreshed.');
    });
  }

  async function handleSelectedFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    elements.uploadErrorAlert.classList.add('d-none');
    const validExtensions = ['.pdf', '.txt', '.md'];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const name = file.name.toLowerCase();
      const isValid = validExtensions.some(ext => name.endsWith(ext));

      if (!isValid) {
        elements.uploadErrorMsg.textContent = `"${file.name}" has an unsupported format. Only .pdf, .txt, and .md files are accepted.`;
        elements.uploadErrorAlert.classList.remove('d-none');
        return;
      }

      if (file.size > 25 * 1024 * 1024) {
        elements.uploadErrorMsg.textContent = `"${file.name}" exceeds maximum allowed size of 25MB.`;
        elements.uploadErrorAlert.classList.remove('d-none');
        return;
      }

      // Live Backend Upload
      if (isBackendConnected) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          showToast(`Uploading and indexing "${file.name}" into FAISS...`);

          const resp = await fetch('/api/v1/documents/upload/', {
            method: 'POST',
            body: formData
          });

          const data = await resp.json();
          if (resp.ok && data.status === 'success') {
            showToast(`Indexed "${file.name}" (${data.document.chunks_count} chunks) into RAG corpus.`);
            await loadBackendDocuments();
          } else {
            elements.uploadErrorMsg.textContent = data.error || 'Failed to index document.';
            elements.uploadErrorAlert.classList.remove('d-none');
          }
        } catch (e) {
          elements.uploadErrorMsg.textContent = 'Network error during upload. Please check backend status.';
          elements.uploadErrorAlert.classList.remove('d-none');
        }
      } else {
        // Fallback local session simulation
        customDocuments.push({
          id: `custom-doc-${Date.now()}-${i}`,
          name: file.name,
          size: formatFileSize(file.size),
          chunks: Math.max(8, Math.round(file.size / 4096)),
          type: name.endsWith('.pdf') ? 'pdf' : 'txt'
        });
        renderDocumentList();
        showToast(`Added ${file.name} to local session corpus (Demo mode).`);
      }
    }
  }

  function formatFileSize(bytes) {
    if (!bytes) return '0 KB';
    return bytes > 1024 * 1024 
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` 
      : `${Math.round(bytes / 1024)} KB`;
  }

  function renderDocumentList() {
    const totalCount = 2 + customDocuments.length;
    elements.kbDocCount.textContent = totalCount;
    elements.kbNavCount.textContent = `${totalCount} docs`;

    let totalChunks = 452;
    customDocuments.forEach(d => totalChunks += d.chunks);
    const statChunksEl = document.getElementById('stat-total-chunks');
    if (statChunksEl) statChunksEl.textContent = totalChunks;

    const customDocsHtml = customDocuments.map(doc => `
      <div class="kb-doc-item p-3 mb-2 rounded border" data-doc-id="${doc.id}">
        <div class="d-flex align-items-start justify-content-between">
          <div class="d-flex align-items-start gap-2">
            <div class="doc-type-icon ${doc.type}-icon">
              <i class="bi ${doc.type === 'pdf' ? 'bi-file-earmark-pdf' : 'bi-file-earmark-text'}"></i>
            </div>
            <div>
              <h5 class="doc-item-title mb-0">${escapeHtml(doc.name)}</h5>
              <span class="doc-item-meta">${doc.size} &bull; ~${doc.chunks} Chunks &bull; Uploaded (Local Session)</span>
            </div>
          </div>
          <span class="badge-subtle-mode">Local Session</span>
        </div>
        <div class="doc-item-progress mt-2">
          <div class="progress" style="height: 4px;">
            <div class="progress-bar custom-progress-bar" style="width: 100%"></div>
          </div>
        </div>
      </div>
    `).join('');

    const baseItems = `
      <div class="kb-doc-item p-3 mb-2 rounded border" data-doc-id="doc-1">
        <div class="d-flex align-items-start justify-content-between">
          <div class="d-flex align-items-start gap-2">
            <div class="doc-type-icon pdf-icon">
              <i class="bi bi-file-earmark-pdf"></i>
            </div>
            <div>
              <h5 class="doc-item-title mb-0">python_3.12_reference.pdf</h5>
              <span class="doc-item-meta">4.2 MB &bull; 420 Chunks &bull; Added Session Init</span>
            </div>
          </div>
          <span class="badge-subtle-success">Indexed (Demo)</span>
        </div>
        <div class="doc-item-progress mt-2">
          <div class="progress" style="height: 4px;">
            <div class="progress-bar custom-progress-bar" style="width: 100%"></div>
          </div>
        </div>
      </div>

      <div class="kb-doc-item p-3 mb-2 rounded border" data-doc-id="doc-2">
        <div class="d-flex align-items-start justify-content-between">
          <div class="d-flex align-items-start gap-2">
            <div class="doc-type-icon txt-icon">
              <i class="bi bi-file-earmark-text"></i>
            </div>
            <div>
              <h5 class="doc-item-title mb-0">gotchas_and_idioms.txt</h5>
              <span class="doc-item-meta">180 KB &bull; 32 Chunks &bull; Added Session Init</span>
            </div>
          </div>
          <span class="badge-subtle-success">Indexed (Demo)</span>
        </div>
        <div class="doc-item-progress mt-2">
          <div class="progress" style="height: 4px;">
            <div class="progress-bar custom-progress-bar" style="width: 100%"></div>
          </div>
        </div>
      </div>
    `;

    elements.kbDocList.innerHTML = baseItems + customDocsHtml;
  }

  // ==========================================================================
  // COPY FIXED CODE TO CLIPBOARD
  // ==========================================================================
  function copyFixedCodeToClipboard() {
    const code = elements.fixedCodeSnippet.textContent;
    if (!navigator.clipboard) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showCopyFeedback();
      return;
    }

    navigator.clipboard.writeText(code).then(() => {
      showCopyFeedback();
    }).catch(() => {
      showToast('Could not copy code. Please copy manually.');
    });
  }

  function showCopyFeedback() {
    elements.copyBtnText.textContent = 'Copied!';
    elements.copyIcon.className = 'bi bi-check-lg me-1 text-success';
    showToast('Fixed code copied to clipboard.');

    setTimeout(() => {
      elements.copyBtnText.textContent = 'Copy Code';
      elements.copyIcon.className = 'bi bi-clipboard me-1';
    }, 2000);
  }

  // ==========================================================================
  // HISTORY LIST RENDERING
  // ==========================================================================
  function renderHistoryList() {
    const historyData = [
      {
        key: 'python-default-arg',
        title: 'Python: Mutable Default Argument (List Accumulator)',
        lang: 'Python 3',
        time: 'Today, 10:45 AM',
        status: 'Doc-Backed (94%)',
        snippet: 'def append_item(item, catalog=[])...'
      },
      {
        key: 'js-closure-async',
        title: 'JavaScript: Loop Var Closure in setTimeout',
        lang: 'JavaScript',
        time: 'Yesterday, 4:20 PM',
        status: 'Doc-Backed (95%)',
        snippet: 'for (var i = 0; i < 3; i++) { setTimeout(...'
      },
      {
        key: 'cpp-iterator-invalidation',
        title: 'C++: Vector Iterator Invalidation in std::erase',
        lang: 'C++',
        time: 'Oct 20, 2:15 PM',
        status: 'Doc-Backed (97%)',
        snippet: 'for (auto it = vec.begin(); ... vec.erase(it)...'
      },
      {
        key: 'java-npe-unboxing',
        title: 'Java: NullPointerException on Automatic Unboxing',
        lang: 'Java',
        time: 'Oct 19, 11:30 AM',
        status: 'Doc-Backed (98%)',
        snippet: 'Double fee = 100.0; Double discount = null; return baseFee - discount...'
      }
    ];

    elements.historyContainer.innerHTML = historyData.map(item => `
      <div class="history-item p-3 mb-2 rounded border bg-surface d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div>
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="badge-subtle-mode">${item.lang}</span>
            <strong class="history-item-title text-dark-custom" style="font-size: 0.9rem;">${item.title}</strong>
          </div>
          <div class="text-secondary" style="font-size: 0.76rem;">
            <span><i class="bi bi-clock me-1"></i>${item.time}</span> &bull; 
            <span class="text-success"><i class="bi bi-shield-check me-1"></i>${item.status}</span>
          </div>
        </div>
        <button class="btn btn-outline-custom btn-sm load-history-btn" data-key="${item.key}" data-bs-dismiss="modal">
          Restore Session
        </button>
      </div>
    `).join('');

    // Bind click events on history buttons
    elements.historyContainer.querySelectorAll('.load-history-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        loadScenario(key);
        showToast(`Restored debugging session: ${key}`);
      });
    });
  }

  // ==========================================================================
  // EXPORT MARKDOWN SUMMARY
  // ==========================================================================
  function exportAnalysisMarkdown() {
    const scenario = DEMO_SCENARIOS[currentScenarioKey];
    if (!scenario) return;

    const mdContent = `# EvidenceDebug AI — Grounded Code Intelligence Report
Generated: ${new Date().toLocaleString()}
Target File: ${scenario.filename}
Language: ${scenario.language}
Corpus: ${scenario.corpusName}

## 1. Observed Problem
${scenario.problemDescription}

## 2. Retrieved Documentation Evidence
${scenario.passages.map(p => `### [${p.id}] ${p.docTitle}
- Section: ${p.docMeta}
- Relevance: ${p.score} (Illustrative Metric)
> "${p.quote.replace(/<[^>]*>?/gm, '')}"
`).join('\n')}

## 3. Grounded Explanation
${scenario.explanation.paragraphs.map(p => p.replace(/<[^>]*>?/gm, '')).join('\n\n')}

## 4. Verified Correction (${scenario.fixedFilename})
\`\`\`${scenario.language}
${scenario.fixedCode}
\`\`\`

---
*Notice: Generated by EvidenceDebug AI (Frontend Prototype). Backend connection to Django RAG planned for next phase.*
`;

    // Download blob
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EvidenceDebug_${scenario.filename.replace(/\.[^/.]+$/, "")}_Report.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Markdown report exported successfully.');
  }

  // ==========================================================================
  // UTILITY HELPERS
  // ==========================================================================
  function showToast(message) {
    if (!elements.appToastElement) return;
    elements.toastMessage.innerHTML = `
      <i class="bi bi-info-circle-fill text-gold me-1"></i>
      <span>${escapeHtml(message)}</span>
    `;
    const toast = bootstrap.Toast.getOrCreateInstance(elements.appToastElement, { delay: 3500 });
    toast.show();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
