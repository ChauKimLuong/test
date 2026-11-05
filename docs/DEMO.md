# Demo sáu chức năng quy trình

**Trình bày trọng tâm workflow:** xem [kịch bản CEO và mẫu MS-BV-01](DEFENSE_DEMO.md), chuẩn bị ngày 13/10/2026. Có bốn bước, 7 tình huống mô phỏng và 5 hồ sơ giả lập.

Chạy `start.ps1`, mở http://localhost:3000. Mật khẩu demo lúc seed: `Demo@2026!`, hoặc mật khẩu tài khoản đã được thay trong ứng dụng.

## 1. Cấu hình và mô phỏng

1. Đăng nhập CDO (`cdo@flowpilot.vn`) → **Quy trình**.
2. Mở **Đề nghị mua sắm — duyệt nhiều cấp** (`CP-MULTI`). Bước đầu là quản lý trực tiếp; từ 10 triệu, CDO và CEO cùng đồng ý.
3. Chọn người gửi Huy và điền dữ liệu thử. Mô phỏng 5 triệu và 15 triệu; xem bước skip/người được giao.
4. Thêm một bước, chọn người/chức danh/nhóm, thay ALL/ANY hoặc điều kiện; lưu nháp. Bản đang dùng giữ nguyên.
5. Nhập ghi chú rồi ban hành. Xem version, nháp revision và lịch sử/so sánh.

## 2. Tuyến nhỏ và lớn

1. Huy (`huy@flowpilot.vn`) → **Tạo yêu cầu** → chọn CP-MULTI → số tiền 5 triệu, mục đích, loại và ngày → gửi.
2. Linh (`linh@flowpilot.vn`) → **Hộp phê duyệt** → **Đồng ý bước này**. Đơn APPROVED; bước Chief SKIPPED trong tiến trình.
3. Huy tạo đơn 15 triệu. Linh đồng ý; CDO và CEO (`ceo@flowpilot.vn`) nhận nhiệm vụ cùng lúc.
4. CDO đồng ý: còn PENDING. CEO đồng ý: APPROVED. Thử một hồ sơ riêng với từ chối để thấy task còn lại bị hủy.

## 3. ANY

1. Huy dùng **Đề nghị hỗ trợ — một lãnh đạo đồng ý** (`CP-ANY`).
2. Linh đồng ý; CDO/CEO nhận nhiệm vụ song song.
3. CDO đồng ý là hoàn tất; task CEO CANCELLED. Hoặc CDO từ chối: còn chờ CEO; CEO đồng ý vẫn hoàn tất.

## 4. Trả bổ sung

1. Huy gửi CP-MULTI 5 triệu. Linh chọn **Trả để bổ sung**, nêu góp ý.
2. Huy mở đơn → **Bổ sung và gửi lại** → sửa thành 15 triệu → lưu/gửi.
3. Cùng mã đơn, vòng 2, chạy lại bước Linh; sau đó có Chief do dữ liệu mới qua ngưỡng.
4. Chọn vòng 1/2 trên tiến trình và bảng dữ liệu; xem góp ý và các giá trị thay đổi được tô nền.

## 5. Giữ phiên bản

1. Giữ đơn A đang chờ Linh, ghi workflow version.
2. CDO sửa quy trình và ban hành version mới.
3. Huy gửi đơn B: B dùng version mới; A và các vòng bổ sung của A vẫn dùng version cũ.
4. Phục hồi cấu hình cũ đưa vào nháp; ban hành để có một version mới, không sửa bản lịch sử.

## 6. Quyền, dữ liệu và bàn giao

- Hoàng (`hoang@flowpilot.vn`) không xử lý thay nhiệm vụ Linh trên hồ sơ Sản phẩm.
- Chief tạo/gửi đơn vẫn cần một người duyệt khác; selector cùng User bị chặn.
- Chỉ người gửi sửa DRAFT/RETURNED. REJECTED/APPROVED/CANCELLED giữ nguyên.
- Mở `.\studio.ps1` → http://localhost:5555; xem workflow_versions, workflow_instances, workflow_step_runs, approval_tasks, task_decisions, request_submissions.
- Chạy `docker compose exec api node tests/run.mjs` để kiểm thử trên DB tạm, không tác động hồ sơ demo.
- Checklist UAT còn cần sinh viên ghi: mobile/bàn phím/dialog/A4 nhiều trang, nội dung góp ý và cách diễn giải các nhánh khi bảo vệ.


## 7. Bốn chức năng vận hành mới

1. CDO → Quy trình → CP-MULTI → bật SLA bước Linh: hạn 1 phút, nhắc trước 1 phút, target CDO → lưu/ban hành. Huy gửi, Linh xem hạn. CDO vào **Thời hạn & điểm chậm** bấm **Kiểm tra hạn ngay** hoặc chờ worker. Quá hạn chuyển task, không tự duyệt.
2. Linh → **Ủy quyền phê duyệt** → chọn CDO và khoảng hiệu lực hiện tại → lưu. Huy gửi đơn mới; CDO nhận. Linh thu hồi lịch; task đã giao vẫn giữ, đơn mới trở lại Linh. Không chọn người đã tham gia bước đó hoặc người gửi.
3. Huy → tạo đơn → **Lưu bản nháp** → tại chi tiết upload bao-gia.txt/pdf. Gửi; Linh comment và trả bổ sung; Huy thêm phiên bản thay tài liệu, gửi lại. Xem vòng từng tài liệu và tải bản cũ. Gỡ chỉ bỏ khỏi lần gửi tiếp theo.
4. CDO → **Thời hạn & điểm chậm**, chọn ngày/làm mới: xem lượt đã kết thúc, chờ dài nhất, p95/mẫu số và link hồ sơ. Thử Hoàng để thấy phạm vi khác.

Cách hoạt động từng chức năng: [WORKFLOW_GUIDE.md](WORKFLOW_GUIDE.md). Hạn tính liên tục, chưa lịch ngày nghỉ/email; file được kiểm tra loại/header, chưa antivirus. Các actual UI ghi trong UAT.md.
