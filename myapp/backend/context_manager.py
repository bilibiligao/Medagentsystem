import copy
# from config_loader import LOGGER
import logging

LOGGER = logging.getLogger("MedGemma")

class ContextManager:
    def __init__(self, max_token_limit=8192):
        self.max_token_limit = max_token_limit

    def sanitize_history_roles(self, messages):
        """
        Merges consecutive messages with the same role to ensure alternating User/Assistant roles.
        This fixes TemplateErrors in some models (like Gemma) which are strict about role alternation.
        """
        if not messages:
            return []
            
        sanitized_messages = []
        for msg in messages:
            if not sanitized_messages:
                sanitized_messages.append(msg)
            else:
                last_role = sanitized_messages[-1]['role']
                current_role = msg['role']
                
                if current_role == last_role:
                    # Merge consecutive messages of the same role
                    prev_content = sanitized_messages[-1]['content']
                    curr_content = msg['content']
                    
                    # Convert both to LIST format for merging
                    if isinstance(prev_content, str):
                        prev_content = [{"type": "text", "text": prev_content}]
                    if isinstance(curr_content, str):
                        curr_content = [{"type": "text", "text": curr_content}]
                    
                    # Append current content to previous
                    # Ensure both are lists before adding
                    if not isinstance(prev_content, list):
                         prev_content = [{"type": "text", "text": str(prev_content)}]
                    if not isinstance(curr_content, list):
                         curr_content = [{"type": "text", "text": str(curr_content)}]

                    sanitized_messages[-1]['content'] = prev_content + curr_content
                else:
                    sanitized_messages.append(msg)
        
        return sanitized_messages

    def manage_context(self, messages, max_limit=None):
        """
        Trims the message history to fit within the max_token_limit.
        Rules:
        1. Always preserve the System Prompt (usually the first message).
        2. Always preserve messages containing images (user provided medical data).
        3. Keep the most recent messages.
        4. Discard older text-only messages if limit is exceeded.
        
        (修剪消息历史以适应 max_token_limit。)
        (规则：)
        (1. 始终保留系统提示词（通常是第一条消息）。)
        (2. 始终保留包含图像的消息（用户提供的医疗数据）。)
        (3. 保留最近的消息。)
        (4. 如果超出限制，丢弃较旧的纯文本消息。)

        Args:
            messages: List of message dicts.
            max_limit: Optional override for max_token_limit.
            
        Returns:
            List of filtered messages.
        """
        limit = max_limit if max_limit is not None else self.max_token_limit
        
        if not messages:
            return []

        # separating system prompt
        # separating system prompt (分离系统提示词)
        system_prompt = None
        if messages[0]['role'] == 'system':
            system_prompt = messages[0]
            working_messages = messages[1:]
        else:
            working_messages = messages[:]

        # identify preserve candidates (images) and calculate current size
        # identify preserve candidates (images) and calculate current size (识别需保留的候选对象（图像）并计算当前大小)
        # We'll use a rough heuristic: 1 char ~= 0.3-0.5 tokens. 
        # Let's be conservative: 1 token ~= 4 chars => 1 char = 0.25 tokens. 
        # BUT for Chinese/Multilingual, 1 char might be 0.5-1 token.
        # Let's estimate: text length / 2.5 for English, text length * 0.7 for Chinese?
        # A simple approximation: len(text). 
        # Since 'max_token_limit' of 8192 usually refers to tokenizer tokens, 
        # keeping char count < limit * 3 is a safe upper bound, or just counting chars if 'limit' is char usage.
        # Given the user said "8192", it implies Token Limit.
        
        # NOTE: Precise token counting requires the tokenizer, which might be slow to run on every request.
        # We will use a character length approximation for performance.
        # 1 Token ~= 3 characters (conservative).
        
        # (注意：精确的 token 计数需要分词器，这在每次请求时运行可能会很慢。)
        # (我们将使用字符长度近似值以提高性能。)
        # (1 Token ~= 3 字符（保守估计）。)
        
        # We will assign a 'weight' to images. e.g. 256 tokens per image (Gemmas typically treat image tokens differently).
        IMAGE_TOKEN_COST = 256 

        total_estimated_tokens = 0
        
        start_index = 0
        kept_indices = set()
        image_indices = set()

        # Pass 1: Identofy Images and Calculate Sizes
        msg_costs = []
        for i, msg in enumerate(working_messages):
            cost = 0
            if isinstance(msg['content'], list):
                for item in msg['content']:
                    if item['type'] == 'text':
                        cost += len(item.get('text', '')) // 3 # Rough estimate
                    elif item['type'] == 'image':
                        cost += IMAGE_TOKEN_COST
                        image_indices.add(i)
            elif isinstance(msg['content'], str):
                cost += len(msg['content']) // 3
            
            msg_costs.append(cost)

        # Pass 2: Select messages to keep
        # We always keep image messages
        current_usage = 0
        if system_prompt:
             # System prompt cost
             current_usage += len(system_prompt['content']) // 3 if isinstance(system_prompt['content'], str) else 0 # Simplified
        
        # Add all image costs first
        for idx in image_indices:
            current_usage += msg_costs[idx]
            kept_indices.add(idx)

        # Now fill the rest with recent messages, traversing backwards
        for i in range(len(working_messages) - 1, -1, -1):
            if i in kept_indices:
                continue
            
            if current_usage + msg_costs[i] <= limit:
                current_usage += msg_costs[i]
                kept_indices.add(i)
            else:
                # We reached the limit, stop adding older text messages
                # But we must continue checking if there are images further back? 
                # No, we already added ALL images. So we can just stop for text.
                # However, strictly strictly speaking, we want "recent" text.
                pass

        # Reconstruct the list
        final_messages = []
        if system_prompt:
            final_messages.append(system_prompt)
        
        for i in range(len(working_messages)):
            if i in kept_indices:
                final_messages.append(working_messages[i])
            else:
                # Logging dropped messages for debug
                # LOGGER.debug(f"Dropped message at index {i} due to context limit.")
                pass
        
        LOGGER.info(f"Context Management: Input {len(messages)} msgs. Kept {len(final_messages)}. Estimated Tokens: {current_usage}/{limit}")
        return final_messages

context_manager = ContextManager()
