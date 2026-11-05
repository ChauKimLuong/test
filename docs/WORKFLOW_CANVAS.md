# Cấu hình workflow bằng sơ đồ flow

Ngày 13/10/2026. Chế độ mới tại **Quy trình phê duyệt → mở mẫu → Sơ đồ flow**, mặc định khi mở một workflow. **Danh sách bước** dùng chung dữ liệu và có thể chuyển qua lại trong khi soạn.

## Thao tác

1. Chọn một node bước/điều kiện/người duyệt để mở phần cấu hình của bước ở panel bên phải; dropdown **Bước cần cấu hình** cũng chọn được bước bằng bàn phím.
2. Trong tab **Bước**, sửa tên, ALL/ANY, selector, điều kiện AND/OR và SLA. Canvas cập nhật theo definition đang soạn.
3. **Thêm bước** chèn một bước duyệt ngay sau bước đang chọn. Các nút lên/xuống trong panel đổi thứ tự thực thi; xóa vẫn giữ tối thiểu một bước. Lưu/ban hành vẫn qua validator và kiểm tra revision ở API.
4. Kéo node để bố trí, cuộn zoom, kéo nền để pan; dùng controls hoặc minimap để xem vùng khác. **Tự sắp xếp** khôi phục bố cục tự sinh. **Toàn màn hình** mở cả canvas và panel; Esc để thoát.
5. **Hoàn tác/làm lại** giữ tối đa 50 thay đổi cấu hình trong phiên soạn; lưu/tải/khôi phục phiên bản chốt lại lịch sử soạn. Bố trí node không thuộc lịch sử cấu hình nghiệp vụ.
6. Tab **Mô phỏng**: chọn Huy, điền dữ liệu thử và chạy. Các bước/nhánh được đánh dấu đi qua, bỏ qua hoặc cần sửa; nhóm ROLE có thể mở thành nhiều người thực tế theo kết quả resolver, kèm tên người thay do ủy quyền.
7. Tab **Ban hành** có lưu nháp, kiểm tra, ghi chú và xác nhận ban hành. Tab **Lịch sử** xem/so sánh/khôi phục phiên bản như trước.

## Ý nghĩa sơ đồ

- Bắt đầu → các bước phù hợp → hoàn tất phê duyệt.
- Node điều kiện có **Đúng** vào bước và **Sai** vào nhánh bỏ qua rồi nối lại trước bước tiếp. Đường bỏ qua nét đứt; không biểu diễn điều kiện sai thành kết thúc toàn hồ sơ.
- Bước có nhiều quy tắc người duyệt mở các nhánh song song và điểm hợp kết quả ALL/ANY. Khi chưa mô phỏng, nhánh biểu diễn quy tắc; khi mô phỏng hợp lệ, nhánh biểu diễn người được resolve thực tế (sau dedup/ủy quyền).
- Các đường nối thể hiện tuyến đồng ý. Từ chối/trả bổ sung vẫn do engine xử lý và kết thúc bước/vòng theo nghiệp vụ; canvas không thêm nhánh quyết định khác vào definition.

## Lưu dữ liệu và giới hạn

Canvas là giao diện cấu hình trên `schemaVersion=1`, cùng definition với danh sách bước. Thêm/xóa/đổi thứ tự/điều kiện/selectors/SLA là thay đổi nghiệp vụ, được đánh dấu chưa lưu. Tọa độ node chỉ lưu localStorage theo assignment + workflow, không gửi DB hoặc làm đổi thứ tự. Không sửa version đã ban hành hay version của hồ sơ đang chạy.

Các đường nối được sinh từ cấu hình; chưa có nối tự do, vòng lặp hoặc thiết kế đồ thị BPMN tùy ý. Việc giới hạn kết nối giúp canvas thể hiện đúng mô hình engine hiện có. Bản v2 đồ thị tổng quát cần thiết kế/compiler/runtime và migration riêng nếu triển khai sau.

## Triển khai và kiểm chứng

- Canvas: `frontend/components/workflow-canvas.tsx`; projection: `frontend/lib/workflow-graph.ts`; inspector dùng lại `workflow-pages.tsx`.
- Dùng [React Flow](https://reactflow.dev/learn), custom node/edge và controls/minimap. Lazy-load client component theo hướng dẫn Next cục bộ; canvas không đưa thư viện vào luồng đăng nhập trước khi được mở.
- Thiết kế theo ui-ux-pro-max: theme enterprise hiện có, nền chấm, card phân loại, panel bên phải, label đầy đủ, focus ring, nút ≥44px, phương án danh sách và dropdown thay cho thao tác kéo. Không sao chép nội dung automation/AI trong ảnh tham khảo vào sản phẩm.
- `npm run test:workflow-graph`: **103 checks đạt**, bao gồm IDs/edges hợp lệ, không chu trình/node mồ côi, bypass nối về bước tiếp, fan-out/fan-in ALL/ANY, nhóm ROLE nhiều người, nhãn giá trị false, selection, dữ liệu definition không bị sửa; replay 7 tình huống MS-BV-01; bypass không đè lên 12 cột song song.
- Typecheck/build frontend đã đạt; web Docker được build để cập nhật bản chạy. Kiểm chứng HTTP/build và projection chưa thay thế UAT trực quan thao tác kéo, focus, toàn màn hình hoặc mobile.

Chạy test trong frontend: `npm run test:workflow-graph`. Cần Node hỗ trợ strip TypeScript (môi trường hiện tại Node 24). Bộ test backend 502 là kết quả đợt trước; không cộng 103 projection thành số backend checks hoặc tuyên bố chạy lại toàn bộ trong đợt UI này.

## Trình bày với giáo viên

CEO mở **MS-BV-01**, bật toàn màn hình. Chọn từng bước trên sơ đồ để chỉ selector/điều kiện/SLA, sau đó mô phỏng Huy với 3 triệu và 35 triệu để thấy bypass và nhóm đồng duyệt. Nêu rõ nhánh là kết quả cấu hình và engine dùng chung; kéo vị trí là bố trí sơ đồ, thay đổi chính sách phải lưu/ban hành version.

Checklist UAT: chọn node và chỉnh đúng bước; thêm/xóa/đổi thứ tự; chuyển flow/list không mất dữ liệu; undo/redo; layout sau reload/tự sắp xếp; keyboard Enter/dropdown; chạy mô phỏng tô đúng nhánh; lưu/ban hành có revision; kiểm tra canvas và panel trên mobile/fullscreen. **Actual browser UAT còn cần thực hiện.**


## Sửa cuộn inspector (13/10/2026)

Khung Mô phỏng từng bị cắt ở các trường cuối: sidebar dùng flex theo cột và giới hạn chiều cao, nhưng panel con được phép co lại trong khi CSS chung `.panel` ẩn overflow. Sửa panel/tab Bước giữ chiều cao nội dung (`flex: 0 0 auto`), sidebar nhận phần tràn để cuộn; hàng tab vẫn sticky. Sidebar có thể nhận focus bằng Tab để dùng phím mũi tên/Page Down.

UAT cần kiểm tra với mẫu MS-BV-01: cuộn tab Mô phỏng tới nút chạy và kết quả; chuyển Bước/Ban hành/Lịch sử; thử toàn màn hình, màn hình thấp và mobile (mobile cuộn trang). Lần sửa này đã build frontend gồm TypeScript thành công; chưa xác minh thao tác cuộn trực tiếp trong trình duyệt.

Docker web build/up thành công, container healthy. /workflows trả HTTP 200 trên localhost và 127.0.0.1; CSS phục vụ thực tế chứa scrollbar-gutter:stable và flex:none (dạng minify tương đương flex:0 0 auto). Kiểm chứng này xác nhận bản sửa đã được phục vụ, không thay thế UAT cuộn.


## Hoàn thiện cho demo ORVA (13/10/2026)

### Điều kiện thuộc bước nào?

Điều kiện là cổng vào của chính bước được cấu hình. Ví dụ MS-BV-01: bước 1 xác nhận nhu cầu luôn chạy; sau đó engine kiểm tra điều kiện bước 2 (từ 5 triệu đến dưới 20 triệu). Vì vậy cổng bước 2 nằm sau bước 1 trên tuyến xử lý. Kiểm tra dữ liệu thực tế: các gate có stepId/stepIndex đúng, nháp và phiên bản ban hành v2 giống nhau; nguyên nhân gây nhầm là nhãn chung và vùng focus cũ.

Node nay ghi rõ “Điều kiện bước 2/3/4”, nhánh bỏ qua ghi số bước; node duyệt ghi “Luôn chạy” hoặc điều kiện của bước tương ứng. Chọn bước trên thanh số hoặc node mở đúng inspector; vùng focus chỉ gồm node duyệt và gate của bước đó. Resize/toàn màn hình căn lại vùng focus. Thanh chọn bước và phần “ĐANG CẤU HÌNH BƯỚC…” đối chiếu trực tiếp hai bên. Đổi bước/tab đưa inspector về đầu, không thay giá trị cấu hình. Layout cache dùng v2 để tọa độ cũ không làm đè các node có kích thước mới.

### Nhập tiền và kiểu chữ

Ô tiền ở dữ liệu mô phỏng, form yêu cầu và ngưỡng điều kiện hiển thị dấu chấm hàng nghìn: 20.000.000. State/API vẫn nhận number 20000000; không gửi chuỗi đã định dạng để engine so sánh. Giữ con trỏ khi gõ ở giữa; hỗ trợ dán số có dấu chấm, xóa trắng, số âm và thập phân dùng dấu phẩy. Giá trị quá giới hạn số an toàn hoặc không hợp lệ bị từ chối. NUMBER được nhận diện là tiền theo key amount/budget/cost/price hoặc nhãn kinh phí/chi phí/số tiền/đơn giá/ngân sách/VND; trường số lượng vẫn dùng input number. Đây là nhận diện theo tên, chưa bổ sung metadata currency riêng cho schema.

Dùng Be Vietnam Pro 400/500/600/700 tự phục vụ từ app/fonts qua next/font/local, kèm OFL.txt. Không tải font Google lúc người dùng mở trang hoặc lúc Docker build. CSS chỉnh cỡ chữ, khoảng cách, focus ring, thẻ điều kiện, vùng chọn bước, panel 410px trên desktop và bố cục một cột ở màn hình nhỏ. Nút 100% cho xem chữ trên sơ đồ ở kích thước gốc.

### Kết quả kiểm chứng

- 113 workflow graph checks đạt, bao gồm gate thuộc bước 2, bước 1 không có gate, focus không lấy gate kế tiếp, số bước cập nhật khi đổi thứ tự và selection theo stepId.
- 28 money input checks đạt: round trip số, ngưỡng 5 triệu/20 triệu, dán, xóa, thập phân, nhập dần, vị trí con trỏ.
- Frontend build/TypeScript và Docker web build cuối đạt; container healthy. /workflows trên localhost và 127.0.0.1 trả 200; CSS mới và 4 font TTF được phục vụ 200.
- Browser thực tế qua cua_repl: CEO đăng nhập, mở MS-BV-01, chọn bước 1/2 khớp inspector và nhãn gate. Kiểm tra viewport gốc và breakpoint desktop 1440×1000; vào toàn màn hình và cuộn sidebar tới kết quả (scrollTop khoảng 926, maxScroll 927). Đổi tab về đầu xác minh scrollTop 0.
- Nhập 35000000 hiển thị 35.000.000, mô phỏng hợp lệ: bước 2 bỏ qua, bước 3 có Mai Anh/Quốc Hoàng, bước 4 có Đức An. Dán 12.000.000 mô phỏng hợp lệ: bước 2 có Quốc Hoàng, bước 3/4 bỏ qua. Chỉ chạy simulate, không lưu/ban hành hay tạo yêu cầu thật.
- Ảnh kiểm chứng: [Bước 2 và gate tương ứng](screenshots/orva-workflow-step2.jpg). Viewport override đã reset; cuối kiểm tra nháp vẫn revision 4, không có thay đổi chưa lưu.

Chưa kiểm tra lại toàn bộ UAT kéo node, undo/redo, mobile 375px và A4; 502 backend checks là kết quả đợt trước. Các kết quả browser ở trên bổ sung cho giới hạn UAT ghi tại các mục trước.
