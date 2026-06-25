"""
RAG Service - Retrieval-Augmented Generation for question answering
Combines semantic search with LLM responses for intelligent Q&A
"""

# --- IMPORTS ---
# List, Dict, Optional, Any — Python type hints for function signatures
from typing import List, Dict, Optional, Any
# search_service — hybrid search (vector + BM25) logic ka central entry point
from services.search_service import search_service
# langfuse — LLM observability tool, har RAG call ko trace karta hai (monitoring)
from langfuse_client import get_langfuse
# Environment-specific LLM (local: direct Bedrock | VDI: Deluxe API Gateway)
# chat_completion — environment ke hisaab se Bedrock ya Gateway se LLM call karta hai
from environment import chat_completion
# recency_multiplier — purane documents ko score mein penalize karta hai
# W_TEMPORAL_QA — normal chat ke liye recency weight (0.35)
# W_TEMPORAL_PROMPT_ENHANCE — IDE/pair-programming ke liye zyada strong recency weight (0.5)
from utils.recency import (
    recency_multiplier,
    W_TEMPORAL_QA,
    W_TEMPORAL_PROMPT_ENHANCE,
)
# os — environment variables padhne ke liye (model name etc.)
import os
# re — regex, query keywords extract karne aur HTML clean karne ke liye
import re
import logging

logger = logging.getLogger(__name__)
 
 
def _strip_html(text: str) -> str:
    """Remove HTML/Confluence XML tags and normalize whitespace."""
    # Confluence pages HTML tags hoti hain (e.g. <p>, <b>, <ac:...>) — inhe space se replace karo
    text = re.sub(r'<[^>]+>', ' ', text)
    # Multiple spaces ko ek single space mein collapse karo
    text = re.sub(r'\s{2,}', ' ', text)
    # Leading/trailing whitespace hata do
    return text.strip()
 
 
# =============================================================================
# RAGService — is class mein poora RAG pipeline ka logic hai
# Teen public methods hain:
#   1. query_with_rag()      → user ke question ka answer stream karo (home page chat)
#   2. get_rag_context()     → sirf chunks return karo, LLM mat bulao (pipeline-analyzer MCP)
#   3. get_enhanced_prompt() → chunks se ek enhanced dev-prompt banao (pair-programming MCP)
# =============================================================================
class RAGService:
    """Service for RAG-based question answering with integrated semantic search"""

    def __init__(self):
        # Model ID env variable se aata hai; agar set nahi hai toh default Claude-4.5-Sonnet use hoga
        self.model_id = os.getenv('DLXAI_CHAT_MODEL', 'Claude-4.5-Sonnet')
   
    def semantic_search(
        self,
        project_id: str,
        query: str,
        limit: int = 5,
        source_type: Optional[str] = None,
        include_context: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Perform semantic search with optional context expansion
       
        Args:
            project_id: Project ID to search within
            query: Natural language search query
            limit: Number of results to return
            source_type: Optional filter by 'confluence' or 'jira'
            include_context: Whether to include chunk ± 1 for context
           
        Returns:
            List of search results with combined content and metadata
        """
        try:
            # 1. Generate embedding for query
            logger.info(f"Generating embedding for query: {query}")
            query_embedding = embedding_service.generate_embedding(query)
           
            # 2. Search embeddings
            logger.info(f"Searching embeddings in project {project_id}")
            results = search_embeddings(
                project_id=project_id,
                query_embedding=query_embedding,
                limit=limit,
                source_type=source_type
            )
           
            if not results:
                return []
           
            # 3. Batch fetch surrounding chunks if needed
            surrounding_chunks_map = {}
            if include_context:
                # Prepare batch identifiers for all results
                chunk_identifiers = [
                    {
                        'source_id': result['source_id'],
                        'chunk_index': result['chunk_index']
                    }
                    for result in results
                    if result['chunk_index'] >= 0
                ]
               
                if chunk_identifiers:
                    surrounding_chunks_map = get_surrounding_chunks_batch(
                        project_id=project_id,
                        chunk_identifiers=chunk_identifiers,
                        window=1
                    )
           
            # 4. Format and combine results
            search_results = []
            for result in results:
                content = result['content_chunk']
               
                # Include surrounding chunks if requested
                if include_context:
                    key = f"{result['source_id']}_{result['chunk_index']}"
                    surrounding = surrounding_chunks_map.get(key, {})
                   
                    # Combine chunks: before + current + after
                    parts = []
                    if surrounding.get('before'):
                        parts.append(surrounding['before'])
                    parts.append(content)
                    if surrounding.get('after'):
                        parts.append(surrounding['after'])
                   
                    content = "\n\n".join(parts)
               
                # Build result dictionary
                search_results.append({
                    'source_type': result['source_type'],
                    'source_id': result['source_id'],
                    'title': result['title'],
                    'content': content,
                    'url': result.get('url', ''),
                    'similarity': float(result['similarity']),
                    'chunk_index': result['chunk_index'],
                    'metadata': result.get('metadata', {})
                })
           
            logger.info(f"Found {len(search_results)} search results")
            return search_results
 
        except Exception as e:
            logger.error(f"Error in semantic_search: {e}")
            raise
   
    async def query_with_rag(
        self,
        project_id: str,
        user_query: str,
        max_chunks: int = 10,
        source_filter: Optional[str] = None,
        include_context: bool = True,
        user_id: Optional[str] = None,
    ):
        """
        Query using RAG - retrieve relevant chunks and generate answer
       
        Args:
            project_id: Project ID to search within
            user_query: User's question
            max_chunks: Number of chunks to retrieve
            source_filter: Optional filter ('confluence' or 'jira')
            include_context: Whether to include chunk ±1 for context
       
        Yields:
            Streaming response chunks and sources
        """
        # Langfuse observer initialize karo — is function ka poora execution trace hoga
        langfuse = get_langfuse()
        try:
            # Agar caller ne source_filter nahi diya, query ke words se auto-detect karo
            # e.g. "sprint issue" → jira | "brd documentation" → confluence | dono → None
            if not source_filter:
                source_filter = self._detect_source_filter(user_query)

            # Step 1 & 2: Multi-query hybrid search (query rewriting + vector + BM25 + RRF)
            # Langfuse mein "rag.search" span open karo taaki search ka time track ho
            logger.info(f"Querying multi-query search for: {user_query[:50]}... (source_filter={source_filter})")
            with langfuse.start_as_current_observation(
                as_type="span",
                name="rag.search",
                metadata={"query_length": len(user_query), "project_id": project_id, "max_chunks": max_chunks, "source_filter": source_filter or ""},
            ):
                # _multi_query_search: original + 3 rewritten queries → 4 parallel searches → RRF merge
                results = self._multi_query_search(
                    project_id=project_id,
                    user_query=user_query,
                    max_chunks=max_chunks,
                    source_type=source_filter,
                    include_context=include_context,
                    user_id=user_id,
                )

            # Agar koi relevant chunk nahi mila, error event yield karo aur function exit karo
            if not results:
                yield {
                    'type': 'error',
                    'message': 'No relevant documentation found for your query.'
                }
                return

            # Step 3: Retrieved chunks ko LLM prompt ke liye aur frontend sources ke liye alag karo
            context_chunks = []  # Yeh LLM ko denge context ke roop mein
            sources = []         # Yeh frontend ko bhejenge clickable citations ke liye

            for result in results:
                # Add to context (search_service already handled chunk expansion with batch operations)
                # "confluence" → "Confluence", "jira" → "Jira" — display ke liye
                source_type = result['source_type'].capitalize()
                context_chunks.append({
                    'source': f"[{source_type}] {result['title']}",
                    'content': result['content'],  # Already includes surrounding chunks if requested
                    'url': result.get('url', '')
                })

                # Track sources — frontend mein "[Confluence] Page Title (87% match)" dikhta hai
                raw_url = result.get('url', '')
                sanitized_url = raw_url
                # Agar URL mein http/https nahi hai toh prefix lagao (Confluence internal links)
                if raw_url and not raw_url.startswith(('http://', 'https://')):
                    sanitized_url = f"https://{raw_url}"

                sources.append({
                    'type': result['source_type'],
                    'title': result['title'],
                    'url': sanitized_url,
                    'similarity': float(result.get('similarity', 0))
                })

            logger.info(f"Built context from {len(context_chunks)} chunks")

            # Step 4: Saare context chunks + user question ko ek single LLM prompt mein pack karo
            prompt = self._build_rag_prompt(user_query, context_chunks)
           
 
 
            # Step 5: Claude ko prompt bhejo aur response SSE chunks ke roop mein stream karo
            # Langfuse "generation" span — input prompt aur final output dono monitor hoti hain
            logger.info("Streaming LLM response...")
            accumulated_output: List[str] = []
            with langfuse.start_as_current_observation(
                as_type="generation",
                name="rag.llm",
                model=self.model_id,
                input=prompt,
                metadata={"project_id": project_id},
            ) as gen_obs:
                async for chunk in self._stream_claude_response(prompt, user_id=user_id):
                    # Text chunks ko accumulated_output mein save karo Langfuse logging ke liye
                    if chunk.get("type") == "chunk":
                        accumulated_output.append(chunk.get("content", ""))
                    # Har chunk seedha frontend ko yield karo — yahi SSE streaming hai
                    yield chunk
                # Poora generated text Langfuse mein update karo (monitoring/billing ke liye)
                gen_obs.update(output="".join(accumulated_output))

            # Step 6: Saare source documents frontend ko bhejo
            # Frontend inhe message ke neeche "[Confluence] Page Title (87% match)" link ke roop mein dikhata hai
            yield {
                'type': 'sources',
                'sources': sources
            }

            # Step 7: Frontend ko signal karo ki stream poori ho gayi — loading indicator band ho
            yield {'type': 'done'}

        except Exception as e:
            logger.error(f"Error in RAG query: {e}")
            # Koi bhi unexpected error aaye toh error event yield karo — connection abruptly mat todo
            yield {
                'type': 'error',
                'message': f'An error occurred: {str(e)}'
            }
   
    # -------------------------------------------------------------------------
    # get_rag_context — pipeline-analyzer MCP ke liye
    # LLM call NAHI karta, sirf raw chunks return karta hai
    # MCP khud inhe apne failure-analysis prompt mein "Organizational Context" section mein daalta hai
    # -------------------------------------------------------------------------
    def get_rag_context(
        self,
        project_id: str,
        user_query: str,
        max_chunks: int = 5,
        source_filter: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve raw RAG chunks for downstream consumers that want to format
        the context themselves (e.g. the pipeline-analyzer MCP, which embeds
        an "Organizational Context" section in its failure-analysis blob).

        Does NOT call the LLM. Returns a list of dicts with keys:
            source_type, source_id, title, content, url, similarity
        """
        try:
            # Multi-query hybrid search chalao — same logic jo query_with_rag mein hai
            results = self._multi_query_search(
                project_id=project_id,
                user_query=user_query,
                max_chunks=max_chunks,
                source_type=source_filter,
                include_context=True,
                user_id=user_id,
            )

            # Results ko clean karo — HTML tags hata do aur sirf zaruri fields rakho
            cleaned = []
            for r in results:
                cleaned.append({
                    'source_type': r.get('source_type', ''),   # 'confluence' ya 'jira'
                    'source_id': r.get('source_id', ''),        # page_id ya issue_key
                    'title': r.get('title', ''),                # document title
                    'content': _strip_html(r.get('content', '')),  # HTML-free plain text
                    'url': r.get('url', ''),                    # original document ka URL
                    'similarity': float(r.get('similarity', 0)),  # relevance score
                })
            return cleaned

        except Exception as e:
            logger.error(f"Error retrieving RAG context: {e}")
            raise  # MCP caller ko propagate karo — woh apna error handling karta hai

    # -------------------------------------------------------------------------
    # get_enhanced_prompt — prompt-enhancer MCP (IDE/Pair-Programming) ke liye
    # Developer ki task leti hai → RAG context + Claude se ek enhanced dev-prompt banati hai
    # -------------------------------------------------------------------------
    async def get_enhanced_prompt(
        self,
        project_id: str,
        user_query: str,
        max_chunks: int = 5,
        source_filter: Optional[str] = None,
        frontend_requirements: str = "",  # Developer-specified tech stack (e.g. "React, TypeScript")
        backend_requirements: str = "",   # Developer-specified tech stack (e.g. "FastAPI, PostgreSQL")
        user_id: Optional[str] = None,
    ) -> str:
        """
        Retrieve context and build an enhanced prompt for IDE use (MCP)
        Does NOT call the LLM, just returns the prompt string.
        """
        try:
            # 1. Multi-query hybrid search.
            # Prompt enhancement runs into IDE code generators where stale
            # context produces wrong code, so use the stronger recency weight
            # (W_TEMPORAL_PROMPT_ENHANCE=0.5) instead of the Q&A default (0.35).
            # IDE mein galat code banana zyada costly hai — isliye recency weight zyada rakha
            results = self._multi_query_search(
                project_id=project_id,
                user_query=user_query,
                max_chunks=max_chunks,
                source_type=source_filter,
                include_context=True,
                user_id=user_id,
                w_temporal=W_TEMPORAL_PROMPT_ENHANCE,  # 0.5 — Q&A (0.35) se zyada strong freshness weight
            )

            # Agar koi relevant doc nahi mila toh simple message return karo
            if not results:
                return f"No relevant documentation found for: {user_query}"

            # 2. Format context — Confluence/Jira ke HTML tags hata do, plain text rakho
            context_chunks = []
            for result in results:
                context_chunks.append({
                    'source': f"[{result['source_type'].capitalize()}] {result['title']}",
                    'content': _strip_html(result['content'])  # HTML clean karo
                })

            # 3. Context chunks ko XML-style tags mein wrap karo taaki Claude inhe clearly parse kare
            # Format: <source_1>Title: ...\nContent: ...</source_1>
            context_text = ""
            for i, chunk in enumerate(context_chunks, 1):
                context_text += f"\n<source_{i}>\nTitle: {chunk['source']}\nContent:\n{chunk['content']}\n</source_{i}>\n"
 
            # ── DEBUG: show what RAG retrieved and what tech stack was passed in ──
            print("\n" + "="*70)
            print("[RAG ENHANCE] === CONTEXT SENT TO CLAUDE ===")
            print(f"[RAG ENHANCE] User Query     : {user_query}")
            print(f"[RAG ENHANCE] Frontend Reqs  : {frontend_requirements or '(not specified)'}")
            print(f"[RAG ENHANCE] Backend Reqs   : {backend_requirements or '(not specified)'}")
            print(f"[RAG ENHANCE] RAG chunks ({len(context_chunks)}) via multi-query hybrid search:")
            for i, chunk in enumerate(context_chunks, 1):
                snippet = chunk['content'][:300].replace('\n', ' ')
                print(f"  [{i}] {chunk['source']}")
                print(f"      {snippet}{'...' if len(chunk['content']) > 300 else ''}")
            print("="*70 + "\n")
            # ── END DEBUG ──
 
            # 4. Ask Claude to generate the Perfect Prompt
            meta_prompt = f"""You are an expert AI prompt engineer. Your goal is to create a highly optimized prompt for an AI coding assistant.
 
I will provide you with:
1. A User Request (what the developer wants to do)
2. Relevant Context from documentation (Confluence/Jira)
3. Tech Stack Requirements (if provided by the developer)
 
Your task:
Write a new, comprehensive prompt that I can send to the AI coding assistant.
- Incorporate relevant information from the Confluence/Jira context (flows, requirements, architecture details).
- If Frontend Requirements are provided, you MUST reference those specific frontend technologies in the generated prompt.
- If Backend Requirements are provided, you MUST reference those specific backend technologies in the generated prompt.
- IMPORTANT: If the Confluence/Jira context mentions tech stack details that conflict with the developer-specified Frontend or Backend Requirements, always prefer the developer-specified values — treat the documentation as potentially outdated for tech stack specifics.
- Be clear, step-by-step, and specific.
- Do NOT answer the user request yourself — just write the PROMPT.
- Start directly with the prompt text, no meta-talk.
 
User Request: {user_query}
 
--- Tech Stack (developer-specified) ---
Frontend: {frontend_requirements if frontend_requirements else "Not specified"}
Backend:  {backend_requirements if backend_requirements else "Not specified"}
-----------------------------------------
 
Relevant Context (from Confluence/Jira):
{context_text}
 
Optimized Prompt:"""
 
            # ── DEBUG: full meta-prompt sent to Claude ──
            print("\n" + "="*70)
            print("[RAG ENHANCE] === FULL META-PROMPT SENT TO CLAUDE ===")
            print(meta_prompt)
            print("="*70 + "\n")
            # ── END DEBUG ──
 
            # 5. Claude ko meta_prompt bhejo — woh ek enhanced developer prompt generate karta hai
            # _stream_claude_response se async chunks aate hain — inhe jod ke ek string banao
            generated_prompt = ""
            async for chunk in self._stream_claude_response(meta_prompt, user_id=user_id):
                if chunk['type'] == 'chunk':
                    generated_prompt += chunk['content']  # Har text piece ko concatenate karo

            # Agar Claude ne kuch return kiya toh woh prompt return karo, warna error string
            return generated_prompt if generated_prompt else f"Error: Failed to generate prompt from context."

        except Exception as e:
            logger.error(f"Error building enhanced prompt: {e}")
            # Exception ko caller tak propagate mat karo — error string return karo
            # (MCP caller string expect karta hai, exception nahi)
            return f"Error retrieving context: {str(e)}"
 
    # -------------------------------------------------------------------------
    # _detect_source_filter — query ke words dekh ke decide karo kahan search karna hai
    # Jira-only ya Confluence-only ya dono (None = dono search karo)
    # -------------------------------------------------------------------------
    @staticmethod
    def _detect_source_filter(query: str) -> Optional[str]:
        """Auto-detect source type from query keywords."""
        q = query.lower()
        # Yeh words milein → Jira se search karo
        jira_keywords = ['jira', 'ticket', 'issue', 'sprint', 'story', 'stories', 'epic', 'bug', 'backlog', 'assignee']
        # Yeh words milein → Confluence se search karo
        confluence_keywords = ['confluence', 'wiki', 'page', 'documentation', 'brd', 'requirement']
        # Count karo kitne Jira aur Confluence words query mein hain
        jira_hits = sum(1 for kw in jira_keywords if kw in q)
        confluence_hits = sum(1 for kw in confluence_keywords if kw in q)
        # Sirf Jira keywords hain → only Jira search karo
        if jira_hits > 0 and confluence_hits == 0:
            return 'jira'
        # Sirf Confluence keywords hain → only Confluence search karo
        if confluence_hits > 0 and jira_hits == 0:
            return 'confluence'
        # Dono hain ya koi nahi → None return karo (dono sources search honge)
        return None
 
    # -------------------------------------------------------------------------
    # _rewrite_query — Claude Haiku se 3 alternative search queries generate karo
    # Yeh cheap LLM call hai (Haiku model, max 256 tokens) — speed ke liye
    # Ek query se zyada angles cover karne ke liye use hota hai
    # -------------------------------------------------------------------------
    def _rewrite_query(self, user_query: str, user_id: Optional[str] = None) -> List[str]:
        """
        Use the LLM to generate 3 alternative search queries for the user's question.
        Returns list of up to 3 rewritten queries (does NOT include the original).
        Falls back to empty list if LLM call fails.
        """
        # Claude Haiku ko yeh prompt dete hain — 3 alag angles se search queries banana hai:
        # 1. Technical query (exact tech names)
        # 2. Business/workflow query
        # 3. Raw keywords only (BM25 keyword search ke liye best)
        prompt = f"""You are a search query optimizer for a software project knowledge base containing Confluence BRDs and Jira user stories.

Given the developer's request, generate exactly 3 alternative search queries. Each must approach the topic differently:

1. A specific technical query mentioning exact technologies, protocols, or standards relevant to this request
2. A broader query capturing related business concepts, workflows, and adjacent features
3. ONLY raw keywords separated by spaces — no sentence structure, just 5-8 domain-specific technical terms (e.g. "tokenization PCI vault card encryption recurring")

Developer request: {user_query}

Return ONLY the 3 queries, one per line, numbered 1-3. No explanations."""

        try:
            logger.info(f"[QUERY_REWRITE] Rewriting query: {user_query[:50]}...")
            # Claude Haiku use karo — Sonnet se sasta, query rewrite ke liye kaafi hai
            # temperature=0.3 — thoda creative but mostly consistent
            response = chat_completion(
                messages=[{"role": "user", "content": prompt}],
                model="Claude-4.5-Haiku",
                temperature=0.3,
                max_tokens=256,          # 3 short queries ke liye 256 tokens kaafi hain
                user_id=user_id,
                token_source="rag_query_rewrite",  # Langfuse mein alag label se track hoga
            )

            # Agar LLM ne kuch return nahi kiya toh empty list return karo
            # _multi_query_search sirf original query se kaam chalayega
            if not response:
                logger.warning("[QUERY_REWRITE] Empty response from LLM, using original query only")
                return []

            # Response ko line-by-line parse karo
            lines = []
            for line in response.strip().split('\n'):
                line = line.strip()
                if not line:
                    continue
                # "1. query text" → "query text" (numbering remove karo)
                cleaned = re.sub(r'^\d+[\.\)\-\:]\s*', '', line).strip()
                if cleaned:
                    lines.append(cleaned)

            # Sirf pehle 3 lines lo — zyada hone ki condition mein truncate karo
            rewritten = lines[:3]
            logger.info(f"[QUERY_REWRITE] Generated {len(rewritten)} alternative queries")
            for i, q in enumerate(rewritten, 1):
                logger.info(f"[QUERY_REWRITE]   {i}. {q[:80]}")

            return rewritten

        except Exception as e:
            logger.error(f"[QUERY_REWRITE] Failed to rewrite query: {e}")
            # Fail silently — original query se hi kaam chalega, crash mat karo
            return []

    # -------------------------------------------------------------------------
    # _multi_query_search — RAG ka core search engine
    # 4 queries parallel mein chalata hai → results merge karta hai → ranked list deta hai
    # -------------------------------------------------------------------------
    def _multi_query_search(
        self,
        project_id: str,
        user_query: str,
        max_chunks: int = 10,
        source_type: Optional[str] = None,
        include_context: bool = True,
        user_id: Optional[str] = None,
        w_temporal: Optional[float] = None,  # None → W_TEMPORAL_QA (0.35) use hoga
    ) -> List[Dict[str, Any]]:
        """
        Multi-query search: rewrite the user query into variants, run hybrid search
        on each in parallel, and merge results with appearance-based boosting and
        a recency multiplier on each chunk's final score.

        Args:
            w_temporal: Recency weight override. None -> uses W_TEMPORAL_QA (0.35).
                        Pass W_TEMPORAL_PROMPT_ENHANCE (0.5) from get_enhanced_prompt
                        for a stronger recency tilt in the pair-programming flow.
        """
        # ThreadPoolExecutor — asyncio loop ko block kiye bina parallel threads chalao
        from concurrent.futures import ThreadPoolExecutor, as_completed

        # Step 1: Original query + 3 LLM-rewritten variants banao
        # all_queries = [original, technical_variant, business_variant, keywords_variant]
        rewritten_queries = self._rewrite_query(user_query, user_id=user_id)
        all_queries = [user_query] + rewritten_queries
        logger.info(f"[MULTI_QUERY] Searching with {len(all_queries)} query variants")

        # Step 2: Har query ke liye hybrid search parallel mein chalao (max 4 threads)
        # per_query_limit — har query se max_chunks ya kam se kam 5 results lo
        per_query_limit = max(max_chunks, 5)

        def _run_search(query_idx_and_query):
            # Ek query ke liye search_service.semantic_search() call karo
            # (vector + BM25 hybrid + surrounding chunk expansion)
            idx, query = query_idx_and_query
            logger.info(f"[MULTI_QUERY] Running search {idx+1}/{len(all_queries)}: {query[:60]}...")
            results = search_service.semantic_search(
                project_id=project_id,
                query=query,
                limit=per_query_limit,
                source_type=source_type,
                include_context=include_context
            )
            logger.info(f"[MULTI_QUERY] Query {idx+1} returned {len(results)} results")
            return idx, results

        # Saari queries parallel mein submit karo, results aane par collect karo
        all_result_lists = [None] * len(all_queries)
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(_run_search, (i, q)) for i, q in enumerate(all_queries)]
            for future in as_completed(futures):
                idx, results = future.result()
                all_result_lists[idx] = results  # Index-wise store karo

        # Step 3: Saare 4 result lists ko ek mein merge karo (RRF scoring)
        # score_map: chunk_key → total RRF score
        # doc_map: chunk_key → best result dict (highest similarity wala)
        # appearance_count: chunk_key → kitni queries mein yeh chunk aaya
        score_map = {}
        doc_map = {}
        appearance_count = {}

        for query_idx, results in enumerate(all_result_lists):
            if not results:
                continue
            for rank, result in enumerate(results, start=1):
                # Key = (source_id, chunk_index) — unique identifier for each chunk
                key = (result.get('source_id', ''), result.get('chunk_index', 0))

                # RRF formula: 1 / (60 + rank) — lower rank = higher contribution
                rrf_contribution = 1.0 / (60 + rank)

                # Boost original query results (1.5x) to preserve user intent
                # Original query jo user ne likhi usika result zyada important hai
                if query_idx == 0:
                    rrf_contribution *= 1.5

                # Score accumulate karo — agar chunk multiple queries mein aaya toh score badhega
                score_map[key] = score_map.get(key, 0.0) + rrf_contribution
                appearance_count[key] = appearance_count.get(key, 0) + 1

                # doc_map mein highest similarity wala result rakho (best version)
                if key not in doc_map or result.get('similarity', 0) > doc_map[key].get('similarity', 0):
                    doc_map[key] = result

        # Step 4: Final score mein teen aur factors add karo
        # query ke words extract karo title matching ke liye
        query_terms = set(re.findall(r'[a-zA-Z]+', user_query.lower()))
        # w_temporal — caller ne override kiya toh woh use karo, nahi toh default QA weight
        effective_w_temporal = w_temporal if w_temporal is not None else W_TEMPORAL_QA
        recency_applied = 0
        for key in score_map:
            count = appearance_count[key]
            # Appearance bonus: +10% per additional query that found this chunk
            # Agar chunk 3 queries mein aaya toh 20% bonus (2 extra appearances × 10%)
            if count > 1:
                score_map[key] *= (1.0 + 0.1 * (count - 1))

            # Title bonus: +20% if chunk title contains query terms
            # Agar chunk ka source title mein query words hain toh woh zyada relevant hai
            doc = doc_map[key]
            title_lower = doc.get('title', '').lower()
            title_hits = sum(1 for t in query_terms if t in title_lower and len(t) >= 3)
            if title_hits >= 2:
                score_map[key] *= 1.2  # 2+ words match → +20%
            elif title_hits == 1:
                score_map[key] *= 1.1  # 1 word match → +10%

            # Recency multiplier: demote older content multiplicatively so that
            # relevance stays dominant but freshness breaks near-ties. Old-but-
            # canonical docs are protected by DECAY_FLOOR (=0.5 in our config).
            # NULL source_updated_at (legacy / orphan) treated as DECAY_FLOOR.
            # Purana document → multiplier < 1.0 → score kam hoga
            r_mult = recency_multiplier(
                doc.get('source_updated_at'),
                w_temporal=effective_w_temporal,
            )
            score_map[key] *= r_mult
            if r_mult < 1.0:
                recency_applied += 1  # Count karo kitne chunks ko recency penalty mili

        logger.info(
            f"[RECENCY] w_temporal={effective_w_temporal:.2f} applied; "
            f"{recency_applied}/{len(score_map)} chunks received a < 1.0 multiplier"
        )

        # Score ke hisaab se descending sort karo (highest score pehle)
        sorted_keys = sorted(score_map.keys(), key=lambda x: score_map[x], reverse=True)

        # SOURCE DEDUP: cap chunks per source page so a megapage with 75+ chunks
        # cannot monopolise top-K. Previous eval showed cases like "eDeposit Retail"
        # filling 4 of 8 result slots with chunks from the same page, drowning out
        # other relevant pages entirely. With max 2 chunks/source we keep room for
        # 1-2 deep contributions from the best-matching page while guaranteeing
        # at least max_chunks/2 distinct sources appear in the top-K.
        # Ek hi Confluence page ke zyada se zyada 2 chunks final list mein aane denge
        MAX_CHUNKS_PER_SOURCE = 2

        merged_results: List[Dict[str, Any]] = []
        per_source_count: Dict[str, int] = {}  # Track karo har source ke kitne chunks liye
        for key in sorted_keys:
            source_id = key[0]
            # Agar is source ke already 2 chunks le liye hain toh skip karo
            if per_source_count.get(source_id, 0) >= MAX_CHUNKS_PER_SOURCE:
                continue
            per_source_count[source_id] = per_source_count.get(source_id, 0) + 1

            # Result dict mein RRF score aur appearances add karo (debugging ke liye useful)
            result = dict(doc_map[key])
            result['rrf_score'] = score_map[key]
            result['query_appearances'] = appearance_count[key]
            merged_results.append(result)

            # max_chunks limit reach ho gayi toh loop band karo
            if len(merged_results) >= max_chunks:
                break

        unique_sources = len(per_source_count)
        logger.info(
            f"[MULTI_QUERY] Merged {sum(len(rl) for rl in all_result_lists if rl)} candidates "
            f"-> {len(merged_results)} chunks across {unique_sources} unique sources "
            f"(cap={MAX_CHUNKS_PER_SOURCE}/source)"
        )
        return merged_results

    # -------------------------------------------------------------------------
    # _build_rag_prompt — context chunks + user question ko ek LLM prompt mein pack karo
    # Yeh prompt seedha Claude ko bheja jata hai
    # -------------------------------------------------------------------------
    def _build_rag_prompt(self, query: str, context_chunks: List[Dict]) -> str:
        """Build prompt for Claude with context"""

        # Har chunk ko "--- Source N: [Type] Title ---" format mein format karo
        context_text = ""
        for i, chunk in enumerate(context_chunks, 1):
            context_text += f"\n\n--- Source {i}: {chunk['source']} ---\n"
            context_text += chunk['content']  # chunk ka actual text content

        # Final prompt banao — context + question + instructions
        # Claude ko strictly sirf context se answer karne ko kaha hai (hallucination rokne ke liye)
        prompt = f"""You are a helpful AI assistant answering questions based on project documentation from Confluence and Jira.

Context from documentation:
{context_text}

User Question: {query}

Instructions:
- Answer based ONLY on the provided context above
- Cite sources using the format [Source: Title] when referencing information
- If the context doesn't contain enough information to answer the question, say "I don't have enough information in the documentation to answer this question."
- Be concise, accurate, and helpful
- Use markdown formatting for better readability

Answer:"""

        return prompt
   
    # -------------------------------------------------------------------------
    # _stream_claude_response — actual LLM call karo aur response yield karo
    # chat_completion environment-aware hai: local=Bedrock, VDI=Deluxe Gateway
    # -------------------------------------------------------------------------
    async def _stream_claude_response(self, prompt: str, user_id: Optional[str] = None):
        """Generate response via gateway and emit as chunk events."""
        try:
            prompt_len = len(prompt)
            # ~4 chars per token ka rough estimate log mein dikhata hai
            logger.info(f"Sending prompt to gateway: model={self.model_id}, prompt_length={prompt_len} chars (~{prompt_len // 4} tokens)")

            # chat_completion synchronous call hai — environment.py se aata hai
            # temperature=0.7 — thoda creative but mostly factual
            # max_tokens=4096 — answer maximum yahi tak hoga
            text = chat_completion(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=4096,
                user_id=user_id,
                token_source="rag_answer",  # Langfuse billing tracking ke liye label
            )

            # Agar LLM ne kuch return kiya toh chunk event yield karo
            # Note: yeh puri response ek hi chunk mein aati hai (true streaming nahi hai)
            if text:
                yield {
                    'type': 'chunk',
                    'content': text
                }

        except Exception as e:
            logger.error(f"Error generating gateway response (prompt={len(prompt)} chars): {e}")
            # LLM call fail hone par error event yield karo — SSE connection open rahegi
            yield {
                'type': 'error',
                'message': f'Error generating response: {str(e)}'
            }


# =============================================================================
# Global singleton instance — poori application mein yahi ek RAGService object use hoga
# orchestration.py, orchestration_internal.py dono isko import karte hain
# =============================================================================
rag_service = RAGService()