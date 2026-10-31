# MINEFALL v1.0 — Điều kiện cần và đủ để chốt phát hành

Đây là cổng phát hành bắt buộc. Có đủ tính năng trên giấy chưa đủ để phát hành; từng mục kiểm thử bên dưới phải có kết quả PASS trên bản build sẽ phát hành.

## A. Gameplay cốt lõi

- [ ] Chơi trọn vẹn một trận online từ sảnh đến kết quả với 2, 3, 4 và 5 người thật.
- [ ] Các kích thước 8×8, 10×10, 12×12, 14×14, 16×16, 18×18 và 20×20 đều tạo đúng số ô và mật độ mìn tương ứng cấu hình; mọi người trong phòng nhận cùng một bản đồ.
- [ ] Cụm hạ cánh liền mạch, ngẫu nhiên, có 15–20 ô an toàn và đủ vị trí xuất phát riêng cho 5 người; số gợi ý tính chính xác.
- [ ] Máy chủ là nguồn sự thật cho mìn ẩn, lượt, đồng hồ, hành động hợp lệ, loại người chơi, thứ hạng, điểm và kết quả. Không client nào nhìn được tọa độ mìn chưa lộ.
- [ ] Di chuyển nhiều lần trong lượt; đào, cắm cờ hoặc gỡ cờ của mình kết thúc lượt. Đấu cờ tiêu chuẩn từ chối thao tác gỡ cờ người khác mà không làm treo lượt.
- [ ] Đồng hồ lượt 60 giây, phạt bỏ lượt −5 điểm và thời lượng trận do người tạo chọn (10/15/20/25/30 phút) hoạt động chính xác; timeout chỉ phạt một lần và chuyển đến người còn sống.
- [ ] Trúng mìn loại đúng người đúng một lần; thứ hạng người bị loại theo thứ tự chết; điểm cuối = điểm hạng + cờ đúng − cờ sai − phạt bỏ lượt. Cờ còn trên bàn của cả người chết đều được tính.

## B. Kết thúc trận và giao diện

- [ ] Hết giờ, chỉ còn một người sống và trường hợp không còn ai sống đều kết thúc đúng, không gọi nhầm người thắng.
- [ ] Lật tiết lộ mìn chạy một lần đến hết; ô nổ ban đầu không bị lật hoặc mất hiệu ứng; cờ sai bật ra và để dấu X.
- [ ] Vương miện, hiệu ứng ăn mừng của người thắng, bảng tổng kết, phân hạng, thống kê cờ và xu thưởng khớp kết quả máy chủ.
- [ ] Không có lỗi JavaScript nghiêm trọng, nút bị khóa vô hạn, render vòng lặp hoặc bộ đếm/sự kiện chạy lặp.

## C. Phòng online và khôi phục

- [ ] Phòng riêng hỗ trợ 2–5 người, capacity và sẵn sàng được kiểm tra từ server; chỉ chủ phòng được bắt đầu.
- [ ] Chuyển chủ phòng, ngắt kết nối, vào lại trong thời hạn hỗ trợ và giữ ghế/màu/ID không tạo bản sao người chơi hoặc mất cờ.
- [ ] Tái đấu hiện đúng số phiếu, chỉ khởi động khi toàn bộ người chơi đủ điều kiện đồng ý, rồi tạo match ID mới, reset roulette, lượt, đồng hồ và bàn cờ.
- [ ] Trạng thái map, sàn, số, nhân vật, cờ, bom, vệt, hiệu ứng loại bỏ và hiệu ứng thắng đồng bộ trên tất cả client; không ai tự chọn loadout thay cho người khác.
- [ ] Đã thử hai cửa sổ trình duyệt thực tế; tiếp đó thử 3, 4 và 5 người. Mỗi kích thước map phải được thử ít nhất một lần trên hai client, gồm 20×20.

## D. Cửa hàng và cosmetic v1.0

- [ ] Có ít nhất 10 cờ, bắt buộc có quốc kỳ Việt Nam; cờ đang cắm lớn hơn bản cũ và vẫn đọc được trên bàn 20×20/điện thoại.
- [ ] Có ít nhất 10 mẫu bom với biểu tượng và bảng màu/hiệu ứng nổ riêng.
- [ ] Có ít nhất 10 hiệu ứng loại bỏ, ít nhất 10 vệt di chuyển và ít nhất 10 hiệu ứng ăn mừng.
- [ ] Có ít nhất 10 sàn; từng sàn đổi cả màu bề mặt/viền và bảng màu số 1–8, số vẫn đủ tương phản để đọc.
- [ ] Ảnh xem trước khớp vật phẩm thực tế; nút miễn phí/mua/trang bị/đang trang bị chính xác; không mua trùng vật phẩm đã sở hữu; xu không âm.
- [ ] Trang bị được lưu trên trình duyệt đang dùng và được truyền/hiển thị đúng trong online. Hồ sơ hiện **lưu cục bộ trên trình duyệt**, chưa đồng bộ tài khoản hoặc thiết bị; phải công bố rõ trước phát hành.
- [ ] Cosmetic chỉ thay đổi hình ảnh/hiệu ứng, không thay đổi xác suất mìn, phạm vi nhìn, thời gian hành động, tốc độ, di chuyển hay điểm.

## E. Kiểm thử kỹ thuật và phát hành

- [ ] Cài sạch từ ZIP giải nén mới bằng `npm install`, chạy `npm test`, rồi khởi động bằng `npm start` thành công.
- [ ] Tất cả bài test tự động PASS; bổ sung regression test cho từng lỗi phát hiện trong giai đoạn chốt release.
- [ ] Thử giao diện desktop và viewport điện thoại; tối thiểu kiểm tra map 20×20 với cờ, trail, explosion và reveal. Chuyển động/particle không được làm tụt hiệu năng đến mức gây trở ngại thao tác.
- [ ] Tùy chọn `prefers-reduced-motion` không gây lỗi luồng; hiệu ứng có dọn dẹp DOM/timer và giới hạn số phần tử.
- [ ] Bản public phải chạy HTTPS/WSS, có origin checking, giới hạn payload/tần suất, kiểm tra lệnh phía server và không ghi lộ vị trí mìn trong log.
- [ ] Có số phiên bản, README chạy/cài đặt, changelog, quy trình rollback và danh sách lỗi đã biết.
- [ ] Không còn lỗi blocker/critical hoặc lỗi nghiêm trọng khiến mất tiến trình trận, sai điểm, khác bản đồ, đứng hình hay nhân đôi phần thưởng.

## Điều kiện đủ để ký phát hành

Chỉ chốt v1.0 khi **tất cả checkbox A–E đều PASS trên đúng mã nguồn/ZIP phát hành**, có log kết quả `npm test`, biên bản smoke test 2–5 client và xác nhận không còn lỗi blocker/critical. Nếu bất kỳ tiêu chí bắt buộc nào chưa kiểm tra, trạng thái là **Release Candidate / chưa phát hành**, không đánh dấu v1.0 dù các tính năng đã được viết xong.

## Không bắt buộc cho v1.0

- Team 2v2 và chế độ Hỗn loạn (cướp/thay cờ đối thủ).
- Tài khoản, cloud save, chuyển xu giữa thiết bị, leaderboard/xếp hạng toàn cầu.
- XP, nhiệm vụ ngày/tuần, battle pass hay cổng Unity.
- Ghép trận công khai và hệ thống xã hội.

Những mục này chỉ được đưa vào sau khi Standard Flag Duel đạt đủ cổng trên; chúng không được phép trì hoãn bằng cách chen thêm tính năng trước khi sửa lỗi phát hành.
