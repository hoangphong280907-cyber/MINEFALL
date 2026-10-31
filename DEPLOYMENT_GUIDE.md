# MINEFALL — Hướng dẫn đưa bản online lên trình duyệt

## Kiến trúc được chọn

- **GitHub:** lưu source, lịch sử thay đổi và chạy GitHub Actions.
- **Render Web Service:** chạy `server/index.js`, phục vụ giao diện cùng các asset và endpoint WebSocket `/ws` trên cùng origin.
- **Trình duyệt:** mở URL HTTPS do Render cấp; WebSocket tự dùng WSS vì cùng origin HTTPS.

Không triển khai riêng `index.html` trên GitHub Pages cho bản online hiện tại: GitHub Pages không chạy `server/index.js` hoặc WebSocket server.

## A. Chuẩn bị repository GitHub

1. Tạo repository mới (khuyên dùng `MINEFALL`) trong tài khoản của mày.
2. Đặt nhánh mặc định là `main`.
3. Đưa nội dung bên trong thư mục dự án lên repository, không phải zip lồng trong một thư mục khác. `package.json` và `render.yaml` phải ở thư mục gốc.
4. Không đưa lên GitHub các thư mục `node_modules`, file `.env*` có dữ liệu thật, access token hoặc file cấu hình cá nhân. `.gitignore` hiện loại trừ `node_modules/`, `.env*` và `.npmrc`.

## B. Tạo dịch vụ Render từ Blueprint

1. Đăng nhập Render và kết nối tài khoản GitHub có repository MINEFALL.
2. Chọn tạo Blueprint, rồi chọn repository.
3. Render đọc `render.yaml`; xác nhận tên dịch vụ `minefall-online` và kế hoạch hiện được khai báo trong file.
4. Khởi chạy deploy. Build command là `npm install --no-audit --no-fund`; start command là `npm start`; health check là `/health`.
5. Khi deploy thành công, mở URL HTTPS do Render cung cấp. Kiểm tra `/health` trả JSON có `status: "ok"` và `version: "1.0.0-rc.2"`.

## C. Kiểm tra game public

1. Mở URL công khai ở một cửa sổ trình duyệt và tạo phòng.
2. Mở URL đó ở một trình duyệt khác hoặc thiết bị khác, nhập mã phòng và vào trận.
3. Kiểm tra cùng map, chủ phòng, số mìn, thời gian trận, cờ, loại người chơi, kết quả và nút tái đấu.
4. Chạy `npm run smoke` trong CI hoặc trên môi trường đã cài dependency để kiểm tra server HTTP/WebSocket cơ bản.
5. Hoàn thành các mục trong `VERSION_1.0_RELEASE_GATES.md` trước khi xóa nhãn Release Candidate.

## D. Giới hạn của host miễn phí

Gói miễn phí có thể tự ngủ khi không có lưu lượng và khởi động lại khi được gọi. Game hiện dùng room state trong bộ nhớ server; nếu dịch vụ bị khởi động lại thì phòng/trận đang chạy có thể mất. Cần dịch vụ luôn hoạt động và thiết kế lưu trạng thái bền vững nếu muốn bảo đảm các trận dài không bị mất.

## E. Mỗi lần cập nhật

- Tạo thay đổi trên nhánh, chạy `npm test` và `npm run smoke` sau khi cài dependency.
- Push hoặc merge vào `main`.
- Đợi GitHub Actions xanh và Render hoàn tất deploy.
- Thử lại một trận online giữa hai trình duyệt trước khi coi bản cập nhật là ổn định.

## F. Rollback

Nếu bản mới gây lỗi, dùng mục Rollback trong Render để quay về deploy trước đó hoặc revert commit lỗi rồi push lại. Giữ lại log GitHub Actions và kết quả test cho bản đã phát hành.
