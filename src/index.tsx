import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bitable, FieldType } from '@lark-base-open/js-sdk';

interface ParameterInfo {
  fieldName: string;
  fieldId: string;
  parameters: number[];
  order: number;
}

interface TextCell {
  type: 'text';
  text: string;
}

interface FieldMeta {
  id: string;
  name: string;
}

interface RecordComparison {
  recordId: string;
  recordName: string;
  differences: {
    fieldName: string;
    parameters: number[];
  }[];
}

interface FieldOption {
  id: string;
  name: string;
  selected: boolean;
}

// 添加飘字提示组件
const FloatingMessage: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  const [isFading, setIsFading] = useState(false);
  
  useEffect(() => {
    // 1秒后开始渐隐
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
      
      // 0.5秒后完全消失
      const hideTimer = setTimeout(() => {
        onClose();
      }, 500);
      
      return () => clearTimeout(hideTimer);
    }, 1000);
    
    return () => clearTimeout(fadeTimer);
  }, [onClose]);
  
  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 9999,
        color: 'white',
        fontSize: '24px',
        fontWeight: 'bold',
        textAlign: 'center',
        padding: '20px',
        cursor: 'pointer',
        transition: 'opacity 0.5s ease',
        opacity: isFading ? 0 : 1
      }}
      onClick={onClose}
    >
      {message}
    </div>
  );
};

// 添加绿框飘字提示组件
const GreenToast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  const [isFading, setIsFading] = useState(false);
  
  useEffect(() => {
    // 1秒后开始渐隐
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
      
      // 0.5秒后完全消失
      const hideTimer = setTimeout(() => {
        onClose();
      }, 500);
      
      return () => clearTimeout(hideTimer);
    }, 1000);
    
    return () => clearTimeout(fadeTimer);
  }, [onClose]);
  
  return (
    <div 
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'rgba(76, 175, 80, 0.9)',
        color: 'white',
        padding: '12px 24px',
        borderRadius: '4px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
        zIndex: 9999,
        fontSize: '16px',
        fontWeight: 'bold',
        textAlign: 'center',
        transition: 'opacity 0.5s ease',
        opacity: isFading ? 0 : 1
      }}
    >
      {message}
    </div>
  );
};

const App: React.FC = () => {
  const [comparisons, setComparisons] = useState<RecordComparison[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [fieldOptions, setFieldOptions] = useState<FieldOption[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [floatingMessage, setFloatingMessage] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const extractParametersFromRecord = async (record: any, fields: any[], fieldMetaList: any[]): Promise<ParameterInfo[]> => {
    const paramInfo: ParameterInfo[] = [];
    
    for (const field of fields) {
      const cellValue = record.fields[field.id];
      
      if (Array.isArray(cellValue) && cellValue.length > 0) {
        const cell = cellValue[0] as TextCell;
        if (cell.type === 'text' && typeof cell.text === 'string') {
          const matches = cell.text.match(/\{(\d+)\}/g);
          if (matches) {
            const numbers = matches.map(match => 
              parseInt(match.replace(/[{}]/g, ''))
            ).sort((a, b) => a - b); // 排序以便比较
            
            const fieldMeta = fieldMetaList.find((f: FieldMeta) => f.id === field.id);
            const order = fieldMeta ? fieldMetaList.indexOf(fieldMeta) : Number.MAX_SAFE_INTEGER;
            
            paramInfo.push({
              fieldName: fieldMeta ? fieldMeta.name : field.id,
              fieldId: field.id,
              parameters: numbers,
              order: order
            });
          }
        }
      }
    }
    
    return paramInfo.sort((a, b) => a.order - b.order);
  };

  const compareAllRecords = async () => {
    try {
      setIsComparing(true);
      setFloatingMessage('开始比较所有记录...');
      
      const table = await bitable.base.getActiveTable();
      const view = await table.getActiveView();
      const fields = await table.getFieldList(); // 获取所有字段，不限制类型
      const fieldMetaList = await view.getFieldMetaList();
      
      // 获取所有记录（处理分页）
      let allRecords: any[] = [];
      let pageToken: string | undefined;
      let totalRecords = 0;
      
      do {
        const recordsResponse = await table.getRecords({
          pageSize: 1000, // 每页获取1000条记录
          pageToken: pageToken
        });
        
        allRecords = allRecords.concat(recordsResponse.records);
        totalRecords += recordsResponse.records.length;
        pageToken = recordsResponse.pageToken;
        
        setFloatingMessage(`正在获取记录...\n已获取 ${totalRecords} 条记录`);
      } while (pageToken);
      
      setFloatingMessage(`总共获取到 ${allRecords.length} 条记录\n开始比较参数...`);
      
      if (allRecords.length === 0) {
        setFloatingMessage('没有记录可比较');
        return;
      }
      
      const comparisons: RecordComparison[] = [];
      let processedRecords = 0;
      
      // 对每条记录进行内部参数比较
      for (const record of allRecords) {
        processedRecords++;
        if (processedRecords % 10 === 0) {
          setFloatingMessage(`正在比较记录...\n已处理 ${processedRecords}/${allRecords.length} 条记录`);
        }
        
        const params = await extractParametersFromRecord(record, fields, fieldMetaList);
        
        // 如果参数数量少于2，则跳过比较
        if (params.length < 2) {
          continue;
        }
        
        // 使用第一个参数作为基准
        const baseParams = params[0].parameters;
        const differences: { fieldName: string; expected: number[]; actual: number[] }[] = [];
        
        // 比较其他参数与基准参数
        for (let i = 1; i < params.length; i++) {
          // 只比较选中的字段
          if (!selectedFields.includes(params[i].fieldId)) {
            continue;
          }
          
          const currentParams = params[i].parameters;
          
          // 比较两个数组是否相等（忽略顺序）
          const sortedBaseParams = [...baseParams].sort((a, b) => a - b);
          const sortedCurrentParams = [...currentParams].sort((a, b) => a - b);
          
          if (JSON.stringify(sortedBaseParams) !== JSON.stringify(sortedCurrentParams)) {
            differences.push({
              fieldName: params[i].fieldName,
              expected: baseParams,
              actual: currentParams
            });
          }
        }
        
        // 如果有差异，则添加到比较结果中
        if (differences.length > 0) {
          // 获取索引列
          const indexFieldMeta = fieldMetaList[0]; // 第一个字段是索引列
          let recordName = `记录 ${record.recordId}`;
          
          // 从索引列获取记录名称
          const indexFieldValue = record.fields[indexFieldMeta.id];
          if (Array.isArray(indexFieldValue) && indexFieldValue.length > 0) {
            const cell = indexFieldValue[0] as TextCell;
            if (cell.type === 'text' && cell.text) {
              recordName = cell.text;
            }
          }
          
          // 添加所有字段的参数到比较结果中
          const allFieldParams = params
            .filter(param => selectedFields.includes(param.fieldId))
            .map(param => ({
              fieldName: param.fieldName,
              parameters: param.parameters
            }));
          
          comparisons.push({
            recordId: record.recordId,
            recordName: recordName,
            differences: allFieldParams
          });
        }
      }
      
      setComparisons(comparisons);
      setFloatingMessage(`比较完成！\n发现 ${comparisons.length} 条不一致的记录`);
    } catch (error) {
      console.error('Error comparing records:', error);
      setFloatingMessage(`比较出错: ${(error as Error).message}`);
    } finally {
      setIsComparing(false);
    }
  };

  // 添加复制记录内容的函数
  const copyRecordContent = async (comparison: RecordComparison) => {
    try {
      const table = await bitable.base.getActiveTable();
      const view = await table.getActiveView();
      const fieldMetaList = await view.getFieldMetaList();
      
      // 获取索引列
      const indexFieldMeta = fieldMetaList[0]; // 第一个字段是索引列
      
      // 获取记录
      const record = await table.getRecordById(comparison.recordId);
      
      // 获取索引列的值
      let indexFieldValue = '';
      const indexFieldCell = record.fields[indexFieldMeta.id];
      if (Array.isArray(indexFieldCell) && indexFieldCell.length > 0) {
        const cell = indexFieldCell[0] as TextCell;
        if (cell.type === 'text' && cell.text) {
          indexFieldValue = cell.text;
        }
      }
      
      // 只复制索引字段的内容
      const textToCopy = indexFieldValue;
      
      // 使用临时文本区域元素进行复制
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          setToastMessage(`已复制索引字段内容: ${indexFieldValue}`);
        } else {
          setToastMessage('复制失败: 无法执行复制命令');
        }
      } catch (err) {
        setToastMessage(`复制错误: ${(err as Error).message}`);
      }
      
      document.body.removeChild(textArea);
    } catch (error) {
      console.error('Error copying record content:', error);
      setToastMessage(`复制错误: ${(error as Error).message}`);
    }
  };

  const handleFieldSelectionChange = (fieldId: string) => {
    setFieldOptions(prev => 
      prev.map(opt => 
        opt.id === fieldId ? { ...opt, selected: !opt.selected } : opt
      )
    );
    
    setSelectedFields(prev => {
      if (prev.includes(fieldId)) {
        return prev.filter(id => id !== fieldId);
      } else {
        return [...prev, fieldId];
      }
    });
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const selectAllFields = () => {
    const allFieldIds = fieldOptions.map(opt => opt.id);
    setFieldOptions(prev => prev.map(opt => ({ ...opt, selected: true })));
    setSelectedFields(allFieldIds);
  };

  const deselectAllFields = () => {
    setFieldOptions(prev => prev.map(opt => ({ ...opt, selected: false })));
    setSelectedFields([]);
  };

  // 初始化字段选项
  const initializeFieldOptions = async () => {
    try {
      const table = await bitable.base.getActiveTable();
      const view = await table.getActiveView();
      const fieldMetaList = await view.getFieldMetaList();
      
      // 获取视图中可见的字段
      const visibleFields = await view.getVisibleFieldIdList();
      
      // 排除索引字段（第一个字段）和隐藏的字段
      const options = fieldMetaList
        .slice(1) // 排除索引字段
        .filter(meta => visibleFields.includes(meta.id)) // 只保留可见字段
        .map(meta => ({
          id: meta.id,
          name: meta.name,
          selected: true
        }));
      
      setFieldOptions(options);
      setSelectedFields(options.map(opt => opt.id));
    } catch (error) {
      console.error('Error initializing field options:', error);
    }
  };

  useEffect(() => {
    // 初始化字段选项
    initializeFieldOptions();

    // 添加数据表切换监听
    const tableChangeListener = bitable.base.onSelectionChange(() => {
      console.log('Selection changed, updating field options...');
      initializeFieldOptions();
    });

    return () => {
      // 清理函数
      tableChangeListener();
    };
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h2>参数对照表</h2>
      
      {/* 字段选择下拉菜单 */}
      <div style={{ marginBottom: '20px', position: 'relative' }}>
        <h3>选择要比较的字段</h3>
        <div 
          style={{ 
            border: '1px solid #ccc', 
            borderRadius: '4px', 
            padding: '8px 12px', 
            cursor: 'pointer',
            backgroundColor: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
          onClick={toggleDropdown}
        >
          <span>
            {selectedFields.length === 0 
              ? '请选择字段' 
              : selectedFields.length === fieldOptions.length 
                ? '已选择所有字段' 
                : `已选择 ${selectedFields.length}/${fieldOptions.length} 个字段`}
          </span>
          <span>{isDropdownOpen ? '▲' : '▼'}</span>
        </div>
        
        {isDropdownOpen && (
          <div style={{ 
            border: '1px solid #ccc', 
            borderRadius: '4px', 
            padding: '8px',
            marginTop: '5px',
            maxHeight: '300px',
            overflowY: 'auto',
            backgroundColor: 'white',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            zIndex: 1000
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginBottom: '8px',
              paddingBottom: '8px',
              borderBottom: '1px solid #eee'
            }}>
              <button 
                onClick={selectAllFields}
                style={{ 
                  padding: '4px 8px', 
                  backgroundColor: '#f0f0f0', 
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                全选
              </button>
              <button 
                onClick={deselectAllFields}
                style={{ 
                  padding: '4px 8px', 
                  backgroundColor: '#f0f0f0', 
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                取消全选
              </button>
            </div>
            {fieldOptions.map(option => (
              <div 
                key={option.id} 
                style={{ 
                  padding: '6px 0',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <input
                  type="checkbox"
                  checked={option.selected}
                  onChange={() => handleFieldSelectionChange(option.id)}
                  style={{ marginRight: '8px' }}
                />
                <span>{option.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <button 
        onClick={compareAllRecords}
        disabled={isComparing}
        style={{ marginBottom: '20px', padding: '8px 16px' }}
      >
        {isComparing ? '比较中...' : '比较所有记录'}
      </button>
      
      {comparisons.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3>不一致的记录 ({comparisons.length})</h3>
          {comparisons.map((comparison, index) => (
            <div key={index} style={{ marginBottom: '10px', padding: '10px', border: '1px solid #ddd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0 }}>记录: {comparison.recordName}</h4>
                <button 
                  onClick={() => copyRecordContent(comparison)}
                  style={{ padding: '5px 10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  复制
                </button>
              </div>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>字段名</th>
                    <th style={{ border: '1px solid #ddd', padding: '8px' }}>参数列表</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.differences.map((diff, diffIndex) => (
                    <tr key={diffIndex}>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{diff.fieldName}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{diff.parameters.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
      
      {/* 飘字提示 */}
      {floatingMessage && <FloatingMessage message={floatingMessage} onClose={() => setFloatingMessage('')} />}
      
      {/* 绿框飘字提示 */}
      {toastMessage && <GreenToast message={toastMessage} onClose={() => setToastMessage('')} />}
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
} 