-- 단어 '개념 그림' (학습 화면). 데이터 입력(관리자 웹·파이프라인)은 후속 작업.
-- 형식: { "title": "악순환", "kind": "cycle" | "flow", "nodes": ["주가 하락", "증거금 부족", "매도 물량 증가", "반대매매"] }
--   cycle: 마지막 노드가 첫 노드로 되돌아가는 순환 (2~6개), flow: 왼→오 한 방향 흐름
-- 읽기 권한은 기존 "words readable" 정책이 그대로 적용된다.
alter table public.words add column concept jsonb;

alter table public.words add constraint words_concept_shape check (
  concept is null or (
    jsonb_typeof(concept -> 'nodes') = 'array'
    and jsonb_array_length(concept -> 'nodes') between 2 and 6
    and concept ->> 'kind' in ('cycle', 'flow')
  )
);
