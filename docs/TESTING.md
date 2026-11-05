# Kết quả kiểm thử FlowPilot

Bản hiện tại CR-02: **502 kiểm tra đạt**, xem mục CR-02 cuối tài liệu. Các bảng 322 và số đo phía trên thuộc đợt sáu chức năng trước đó, được giữ làm mốc so sánh.

Ngày 01/10/2026; nâng cấp từ cf7c782, thay đổi ở working tree.

| Nhóm | Actual | Source/lệnh |
|---|---|---|
| Backend/frontend build | Đạt | npm run build mỗi thư mục |
| Prisma generate | Đạt | npm run prisma:generate |
| Regression | 100 đạt | backend/tests/integration.mjs |
| Rule validation/conditions | 52 đạt | backend/tests/workflow-rules.mjs |
| Migration baseline | 15 đạt | backend/tests/workflow-migration.mjs |
| Advanced workflow | 155 đạt | backend/tests/workflow-integration.mjs |
| Tổng có bộ đếm | **322 đạt** | Không tính assert load |
| Load | Đạt ngưỡng | backend/tests/workflow-load.mjs |
| Docker build/health | Đạt | api/web build, db/api/web healthy |
| Restore backup | Đạt | DB riêng, checksum request khớp |

DB tạm và API 3099; cleanup finally, không tác động demo. Migration test dựng 001–004, seed/fixture DRAFT/PENDING/APPROVED/REJECTED/CANCELLED, áp 005, đối chiếu và xử lý tiếp legacy pending bằng engine.

Đã kiểm tra nhiều bước, skip, AND/OR/date/rỗng/0/false, selector/scope/self-user, ALL/ANY/concurrency, quyền, revision, immutable/pinned version, bổ sung đổi tuyến, submit idempotency, rollback thiếu người, BLOCKED/retry và restore vào nháp.

## Hiệu năng trên host

Windows, Ryzen 7 5800H (16 logical processors), RAM 15,4 GiB. Node 24 API trên host, PostgreSQL 17 Docker; localhost. 1.000 hồ sơ PENDING có instance/step/task. 20 session cookie riêng mỗi nhóm sender/approver; 20 calls đồng thời/batch. Read 60 mẫu/nhóm; mutation 20 mẫu/nhóm.

| Thao tác | p95 | Mục tiêu |
|---|---:|---:|
| Inbox | 721 ms | <1.000 ms |
| Detail | 154 ms | <1.000 ms |
| Decision | 347 ms | <2.000 ms |
| Submit | 1.153 ms | <2.000 ms |

Số liệu lần xác minh cuối trên host; tải tổng hợp máy phát triển, không suy ra SLA production. Runner in actual mới và assert ngưỡng.

## Xác minh container cuối ngày 01/10/2026

Sau khi build lại api/web và `docker compose up -d --wait`, chạy `docker compose exec -T api node tests/run.mjs`: exit 0, **322 kiểm tra đạt** và DB tạm đã được xóa. Bộ fixture, số session và số mẫu tải giống phép đo host ở trên; API kiểm thử và PostgreSQL đều trong Docker trên cùng máy phát triển.

| Thao tác | p95 container | Mục tiêu |
|---|---:|---:|
| Inbox | 624 ms | <1.000 ms |
| Detail | 131 ms | <1.000 ms |
| Decision | 350 ms | <2.000 ms |
| Submit | 711 ms | <2.000 ms |

Không dùng hai lần đo host/container làm benchmark so sánh kiến trúc. Cả hai chỉ xác nhận ngưỡng trong môi trường và fixture đã nêu.

## Backup/demo

backups/pre-workflow-engine-20261001-091108.dump: 61.214 byte, Git ignore. Restore khớp 8 users/9 requests/25 audit, checksum request 803f711a37bb2afaa9a3b1739f977b0e.

Sau migration giữ 8 users/9 requests, 8 instance/task và 22 request audit cũ; thêm CP-MULTI/CP-ANY. HTTP login/health 200, Studio 5555.

## Chưa nghiệm thu trực quan

Responsive, Tab/dialog, A4 nhiều trang chưa có visual QA/UAT. Sinh viên thử [DEMO.md](DEMO.md), điền [UAT.md](UAT.md). Máy thứ hai clone chưa được xác minh.

## Chạy lại

Backend: npm run prisma:generate, npm run build, npm run test:integration (PostgreSQL Compose hoạt động).

Frontend: npm run build. Từ PrjectDemo: docker compose exec api node tests/run.mjs. Studio dùng studio.ps1; kiểm thử nghiệp vụ qua UI/API.


## CR-02 — kiểm thử vận hành

Actual host: **502 kiểm tra đạt** = 100 regression + 52 rules + 15 migration 001–006 + 155 advanced + 180 operations. Bộ mới workflow-operations.mjs kiểm tra SLA/escalation, task transfer/ALL/ANY/race, delegation active/future/revoke/fallback, mô phỏng người thay; byte download/quyền/tên/MIME/Base64/UTF8/stale revision, attachment version theo round/archival/immutability; comment và báo cáo scope/range. Timer bị tắt trong test để điều khiển tick qua endpoint có permission; test không tuyên bố UAT trực quan đã đạt.

Phép đo tải trong đợt này có hai lượt host không đạt inbox p95 17.252ms và 40.515ms; một lượt ở giữa đạt 695ms. Sau đổi inbox ARRAY membership sang EXISTS và ANALYZE requests/instances/steps/tasks sau bulk insert, lần host cuối đạt: inbox 488ms (60 mẫu), detail 144ms (60), decision 376ms (20), submit 1.316ms (20), concurrency 20. Các số đo mới là trạng thái DB có thống kê planner cập nhật, không đo thời gian khởi tạo 1.000 fixture. Fixture/session/hardware và ngưỡng giữ nguyên; không dùng số đo này làm SLA production. Cần đo thêm khi có cơ cấu/dữ liệu triển khai thật.

Docker/build/up cuối: thành công, db/api/web healthy; migration 001–006. Trong container chạy runner exit 0: **502 checks đạt**, cleanup DB riêng thành công. Load cùng fixture có ANALYZE: inbox 611ms/60 mẫu, detail 139ms/60, decision 329ms/20, submit 781ms/20; concurrency 20. Đạt ngưỡng 1.000ms read/2.000ms mutation.

HTTP login/health/Studio 200; smoke Next proxy CDO login + metrics + delegations thành công. Demo giữ 8 users/9 requests/8 instances/8 tasks và trạng thái cũ. Backup pre-workflow-operations-20261001.dump 91.829 byte, Git ignore. Các số 322 phía trên thuộc đợt sáu chức năng trước CR-02, được giữ để so sánh.


## CR-04 — canvas workflow

`frontend npm run test:workflow-graph`: 103 checks đạt. Projection có đủ nhánh Đúng/Sai và resume, fan-out/fan-in ALL/ANY, ROLE resolve nhiều người, state mô phỏng, định danh/reachability/DAG, không mutate definition, replay 7 MS-BV-01 scenarios, layout bypass ngoài 12 nhánh. Test không phải browser interaction test. `npm run lint`/frontend build đạt, HTTP /workflows trên dev 200.

Dependency @xyflow/react 12.12.0, npm/pnpm lockfiles đồng bộ. npm audit hiện báo 2 high tại Next 16.3.7 và source-map-js; chưa có kết luận security gate đạt từ các kiểm tra graph/build. UAT cần thử node selection/edit/save, drag/zoom/minimap/fullscreen, chuyển list/flow/undo, focus/keyboard/mobile; chưa ghi actual đạt.


### ORVA workflow presentation — 13/10/2026

`npm run test:workflow-graph`: 113 checks đạt; `npm run test:money-input`: 28 checks đạt. Thêm regression cho quyền sở hữu gate theo stepId/stepIndex, focus của bước 1 không lấy điều kiện bước 2, và numeric payload của tiền tại ngưỡng 5m/20m. Frontend/Docker build gồm TypeScript đạt. Browser CEO MS-BV-01: chọn bước 1/2, tiền định dạng 35.000.000, mô phỏng 12m/35m, sidebar cuộn tới max, đổi tab về đầu, toàn màn hình và desktop 1440×1000 đã kiểm tra; viewport đã reset. Bằng chứng/giới hạn ở WORKFLOW_CANVAS.md và docs/screenshots/orva-workflow-step2.jpg.

## Xác minh trước khi push — 05/11/2026

- Backend `npm run build`: đạt; `npx --no-install prisma validate`: schema hợp lệ.
- Frontend `npm run build`: đạt, gồm TypeScript.
- Frontend workflow graph: **115 checks đạt**; money input: **28 checks đạt**.
- Backend runner trên host, PostgreSQL Docker: **502 checks đạt** (52 rules, 15 migration, 100 integration, 155 advanced workflow, 180 operations). Runner nạp cấu hình qua `loadRuntimeEnv()`, tạo database tạm riêng và đã dọn xong; không chạy migration hoặc seed vào database demo.
- Load: 1.000 hồ sơ pending, 20 session đồng thời/batch; inbox p95 **710 ms**, detail **200 ms**, decision **668 ms**, submit **1.721 ms**. Đạt ngưỡng 1.000 ms cho read và 2.000 ms cho mutation trong fixture phát triển; không suy ra SLA production.
- Tổng các bộ kiểm tra có đếm: **645 checks**; bài tải được báo riêng.
- Rà mẫu khóa bí mật trên 221 file văn bản không phát hiện private key hoặc token thuộc các mẫu đã quét. Các `.env` thật, node_modules, dist, .next và backup không nằm trong thay đổi chuẩn bị commit. Đây không phải kết luận kiểm toán bảo mật toàn diện.
- Lượt này không chạy lại Docker image build, browser UAT hoặc npm audit. Không đưa thư mục UIUX bên ngoài PrjectDemo vào repo.
