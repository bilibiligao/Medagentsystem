import zipfile
import os
import sys

def package_app():
    # 1. 基础配置
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_filename = os.path.join(current_dir, "MedGemma_Deploy.zip")
    
    # 2. 排除配置 (黑名单)
    exclude_dirs = {
        '.venv', '__pycache__', '.git', '.vscode', '.idea', 'node_modules',
        'wandb', 'runs', 'tmp'
    }
    exclude_files = {
        os.path.basename(output_filename), 
        '.DS_Store', 
        'backend.log',
        'medgemma.log',
        # Exclude setup scripts for local windows dev to keep package clean
        'setup_local_full.bat',
    }
    exclude_extensions = {'.pyc', '.pyd', '.pyo'}

    # 3. 模型文件夹处理
    model_folder = "medgemma-1.5-4b-it"
    
    # 自动排除大型权重文件
    print(f"\n检测到模型文件夹: {model_folder}")
    print(">>> 自动策略: 排除大型权重文件 (.safetensors)，保留配置文件。")
    print("    请记得手动上传 model-*.safetensors 文件到服务器！")
    
    exclude_files.update({
        "model-00001-of-00002.safetensors",
        "model-00002-of-00002.safetensors"
    })

    print("\n正在扫描文件并打包...")
    
    file_count = 0
    try:
        with zipfile.ZipFile(output_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(current_dir):
                # 修改 dirs 列表以跳过排除的目录
                dirs[:] = [d for d in dirs if d not in exclude_dirs]
                
                for file in files:
                    if file in exclude_files or any(file.endswith(ext) for ext in exclude_extensions):
                        continue
                    
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, current_dir)
                    
                    # 特殊处理 .sh 文件: 强制转换为 LF 换行符 (防止 Linux 报错 \r command not found)
                    if file.endswith('.sh'):
                        try:
                            with open(file_path, 'rb') as f:
                                content = f.read()
                            # Replace CRLF with LF
                            content = content.replace(b'\r\n', b'\n')
                            zipf.writestr(arcname, content)
                            print(f"Converting & Adding: {arcname}")
                        except Exception as e:
                            print(f"Warning: Could not convert {arcname}, adding as is. Error: {e}")
                            zipf.write(file_path, arcname)
                    else:
                        # 普通文件直接添加
                        print(f"Adding: {arcname}")
                        zipf.write(file_path, arcname)
                    
                    file_count += 1
                    
        print("-" * 60)
        print(f"打包完成!")
        print(f"生成文件: {output_filename}")
        print(f"包含文件数: {file_count}")
        print(f"文件大小: {os.path.getsize(output_filename) / (1024*1024):.2f} MB")
        print("-" * 60)
        print("使用说明:")
        print(f"1. 将 {os.path.basename(output_filename)} 上传至您的云服务器")
        print("2. 解压: unzip MedGemma_Deploy.zip")
        print("3. 进入目录并运行: ./deploy.sh")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n[错误] 打包失败: {e}")
        input("按 Enter 键退出...")

if __name__ == "__main__":
    package_app()
    input("\n按 Enter 键关闭窗口...")
